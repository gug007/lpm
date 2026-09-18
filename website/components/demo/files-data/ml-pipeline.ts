import type { ProjectFiles } from "./types";

// `pytest -q` reports 23 passing, and `ls` lists no top-level tests/ — so the
// suite lives under pipeline/.
export const ML_PIPELINE: ProjectFiles = {
  paths: [
    ".env.example",
    ".gitignore",
    "data/raw/events_2026_08.csv",
    "data/raw/events_2026_09.csv",
    "data/test.parquet",
    "data/train.parquet",
    "notebooks/eda.ipynb",
    "notebooks/error-analysis.ipynb",
    "notebooks/train.ipynb",
    "pipeline/__init__.py",
    "pipeline/config.py",
    "pipeline/helpers.py",
    "pipeline/ingest.py",
    "pipeline/io.py",
    "pipeline/shared.py",
    "pipeline/tests/__init__.py",
    "pipeline/tests/conftest.py",
    "pipeline/tests/test_eval.py",
    "pipeline/tests/test_ingest.py",
    "pipeline/tests/test_train.py",
    "runs/metrics.json",
  ],
  content: {
    ".lpm.yml": `name: ml-pipeline
root: ~/Projects/ml-pipeline

services:
  notebook:
    cmd: jupyter lab --port 8888
    port: 8888
  trainer: python -m pipeline.train --watch

actions:
  train: python -m pipeline.train
  eval: python -m pipeline.eval --latest
`,
    "README.md": `# ml-pipeline

Fraud scoring: ingest, features, train, evaluate. Runs land in \`runs/\` and are
tracked with MLflow.

## Running it

\`\`\`bash
uv sync
python -m pipeline.train          # writes runs/<run-id>.ckpt
python -m pipeline.eval --latest  # scores runs/latest.ckpt
\`\`\`

## Layout

    data/        parquet splits and the raw CSV dumps they come from
    pipeline/    ingest, features, train, eval, and the test suite
    notebooks/   exploration — nothing here is on the training path
    runs/        checkpoints and metrics

## A note on the split

Anything fitted on the data — scalers, encoders, imputers — is fitted on the
train split only. Fitting on the whole frame leaks the validation set and
flatters every metric downstream.
`,
    "pyproject.toml": `[project]
name = "pipeline"
version = "0.6.1"
requires-python = ">=3.11"
dependencies = [
  "pandas>=2.2",
  "pyarrow>=16.1",
  "scikit-learn>=1.5",
  "mlflow>=2.14",
  "joblib>=1.4",
]

[dependency-groups]
dev = [
  "pytest>=8.2",
  "ruff>=0.5",
]

[tool.pytest.ini_options]
testpaths = ["pipeline/tests"]
addopts = "-q"

[tool.ruff]
line-length = 100
`,
    "Makefile": `.PHONY: train train-full eval test

train:
	python -m pipeline.train

train-full:
	python -m pipeline.train --full

eval:
	python -m pipeline.eval --latest

test:
	pytest -q
`,
    "pipeline/features.py": `"""Feature construction for the fraud model.

Everything here runs on both the training frame and a single scoring request,
so nothing may depend on the shape of the batch it is given.
"""

from __future__ import annotations

import pandas as pd
from sklearn.preprocessing import RobustScaler

from .config import Config

AMOUNT_CAP = 0.995


def _cap_outliers(df: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    """Clip the long tail at a robust quantile instead of dropping it."""
    cap = df["amount"].quantile(AMOUNT_CAP)
    df["amount"] = df["amount"].clip(upper=cap)
    return df


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df = _cap_outliers(df, Config())
    df = df.dropna(subset=["user_id"])
    # max() leaks the test set into training — scale on the train split only
    scaler = RobustScaler().fit(df.loc[df.split == "train", ["amount"]])
    df["amount_norm"] = scaler.transform(df[["amount"]])
    df["is_weekend"] = df["ts"].dt.dayofweek >= 5
    return df
`,
    "pipeline/train.py": `"""Train the fraud model and write a checkpoint."""

from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import mlflow
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier as GradientBoosting
from sklearn.metrics import f1_score
from sklearn.model_selection import train_test_split

from .config import Config
from .features import build_features

RUNS = Path("runs")


def _load(cfg: Config) -> pd.DataFrame:
    frame = pd.read_parquet(cfg.train_path)
    return build_features(frame)


def train(cfg: Config) -> Path:
    RUNS.mkdir(exist_ok=True)
    run_id = cfg.run_id()

    frame = _load(cfg)
    features = [c for c in frame.columns if c not in ("label", "split", "user_id")]
    X_train, X_val, y_train, y_val = train_test_split(
        frame[features],
        frame["label"],
        test_size=0.2,
        stratify=frame["label"],
        random_state=cfg.seed,
    )

    model = GradientBoosting(**cfg.params)
    model.fit(X_train, y_train)
    mlflow.log_metric("val_f1", f1_score(y_val, model.predict(X_val)))
    mlflow.log_params(cfg.params)
    ckpt = RUNS / f"{run_id}.ckpt"
    joblib.dump(model, ckpt)
    (RUNS / "latest.ckpt").write_bytes(ckpt.read_bytes())
    return ckpt


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--watch", action="store_true")
    train(Config(full=parser.parse_args().full))
`,
    "pipeline/eval.py": `"""Score a checkpoint against the held-out split."""

from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score

from .config import Config
from .features import build_features

RUNS = Path("runs")


def score(ckpt: Path, cfg: Config) -> dict[str, float]:
    model = joblib.load(ckpt)
    frame = build_features(pd.read_parquet(cfg.test_path))
    features = [c for c in frame.columns if c not in ("label", "split", "user_id")]
    pred = model.predict(frame[features])
    return {
        "accuracy": accuracy_score(frame["label"], pred),
        "f1": f1_score(frame["label"], pred),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--latest", action="store_true")
    parser.add_argument("--refit", action="store_true")
    args = parser.parse_args()

    cfg = Config()
    ckpt = RUNS / "latest.ckpt" if args.latest else cfg.checkpoint
    print(f"loading checkpoint ./{ckpt}")

    if args.refit:
        # Refitting the scaler on the train split alone costs about two points
        # of accuracy — the two points the leak was buying.
        cfg = cfg.without_leak()

    metrics = score(ckpt, cfg)
    print(f"accuracy {metrics['accuracy']:.4f}  f1 {metrics['f1']:.4f}")


if __name__ == "__main__":
    main()
`,
    "pipeline/tests/test_features.py": `import pandas as pd
import pytest

from pipeline.features import build_features


@pytest.fixture
def frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "user_id": ["a", "b", "c", None],
            "amount": [10.0, 40.0, 4000.0, 5.0],
            "ts": pd.to_datetime(["2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08"]),
            "split": ["train", "train", "test", "train"],
        }
    )


def test_drops_rows_without_a_user(frame: pd.DataFrame) -> None:
    assert len(build_features(frame)) == 3


def test_amount_norm_uses_train_split_only(frame: pd.DataFrame) -> None:
    out = build_features(frame)
    train_rows = out[out.split == "train"]
    # The test split holds the largest amount; if it had been part of the fit,
    # nothing in the train split could exceed 1.
    assert train_rows["amount_norm"].max() < out["amount_norm"].max()


def test_is_weekend_marks_saturday(frame: pd.DataFrame) -> None:
    out = build_features(frame)
    assert out.loc[out.ts == "2026-09-05", "is_weekend"].item() is False
`,
  },
};
