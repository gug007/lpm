"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import {
  dayMatches,
  monthPath,
  releaseCount,
  TOPICS,
  type ChangelogMonth as Month,
} from "@/lib/changelog-days";
import { ChangelogFilters } from "./changelog-filters";
import { ChangelogMonth } from "./changelog-month";
import { ChangelogRail } from "./changelog-rail";
import { useChangelogData } from "./use-changelog-data";

type Props = { months: Month[]; total: number };

const add = (set: ReadonlySet<string>, month: string) => new Set(set).add(month);

export function ChangelogBrowser({ months, total }: Props) {
  const [query, setQuery] = useState("");
  const [topicId, setTopicId] = useState<string | null>(null);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [opening, setOpening] = useState<string | null>(null);
  const scrollTarget = useRef<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const filtersSeen = useRef(false);
  const [scrollRequest, setScrollRequest] = useState(0);
  const [current, setCurrent] = useState<string | null>(months[0]?.month ?? null);
  const { months: all, loading, load } = useChangelogData();

  const scrollTo = (id: string) => {
    scrollTarget.current = id;
    setScrollRequest((n) => n + 1);
  };

  const search = useDeferredValue(query.trim());
  const topic = TOPICS.find(({ id }) => id === topicId) ?? null;
  const filtering = search !== "" || topic !== null;

  const view = months.flatMap(({ month, releases, days }) => {
    if (!filtering) {
      return [{ month, releases, days: days ?? all?.get(month) ?? null, expanded: days !== null || opened.has(month) }];
    }
    const matched = (all?.get(month) ?? []).filter((day) => dayMatches(day, search, topic));
    return matched.length ? [{ month, releases: releaseCount(matched), days: matched, expanded: true }] : [];
  });
  const matchedTotal = view.reduce((sum, { releases }) => sum + releases, 0);

  useEffect(() => {
    if (filtering) load().catch(() => {});
  }, [filtering, load]);

  // The list shrinks as you filter, so bring its top back into view.
  useEffect(() => {
    if (!filtersSeen.current) {
      filtersSeen.current = true;
      return;
    }
    const top = list.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) window.scrollTo({ top: window.scrollY + top - 96, behavior: "instant" });
  }, [search, topicId]);

  // A link to a release in an older month opens that month first.
  useEffect(() => {
    const openHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!/^v\d/.test(id) || document.getElementById(id)) return;
      load().then((byMonth) => {
        for (const [month, days] of byMonth) {
          if (days.some((day) => day.releases.some((r) => `v${r.version}` === id))) {
            setQuery("");
            setTopicId(null);
            setOpened((set) => add(set, month));
            scrollTarget.current = id;
            setScrollRequest((n) => n + 1);
            return;
          }
        }
      }, () => {});
    };
    openHash();
    window.addEventListener("hashchange", openHash);
    return () => window.removeEventListener("hashchange", openHash);
  }, [load]);

  // Kept until its element renders: a cleared search lands a render later.
  useEffect(() => {
    const target = scrollTarget.current && document.getElementById(scrollTarget.current);
    if (!target) return;
    target.scrollIntoView();
    scrollTarget.current = null;
  }, [scrollRequest, opened, search]);

  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>("section[id^='m-']");
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((entry) => entry.isIntersecting);
        if (hit) setCurrent(hit.target.id.slice(2));
      },
      { rootMargin: "-15% 0px -75% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [view.length, filtering]);

  const open = (month: string): Promise<void> => {
    if (months.find((m) => m.month === month)?.days || all) {
      setOpened((set) => add(set, month));
      return Promise.resolve();
    }
    setOpening(month);
    return load().then(
      () => setOpened((set) => add(set, month)),
      () => window.location.assign(monthPath(month)),
    );
  };

  const goToMonth = (month: string) => {
    open(month).then(() => scrollTo(`m-${month}`));
  };

  const clear = () => {
    setQuery("");
    setTopicId(null);
  };

  const filters = { query, topicId, onQuery: setQuery, onTopic: setTopicId, total };

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-14">
      <div ref={list} className="min-w-0">
        <div className="mt-10 lg:hidden">
          <ChangelogFilters {...filters} />
        </div>
        {filtering && (
          <p aria-live="polite" className="mt-10 flex flex-wrap items-center gap-x-3 text-sm text-gray-500 dark:text-gray-400">
            {all
              ? matchedTotal
                ? `${matchedTotal} of ${total} releases match.`
                : "No release matches."
              : "Loading every release…"}
            <button
              type="button"
              onClick={clear}
              className="min-h-9 font-medium text-gray-700 underline decoration-gray-300 underline-offset-4 hover:text-gray-900 dark:text-gray-300 dark:decoration-gray-600 dark:hover:text-white"
            >
              Clear filters
            </button>
          </p>
        )}
        {view.map((month) => (
          <ChangelogMonth
            key={month.month}
            {...month}
            loading={loading && opening === month.month}
            onOpen={(m) => void open(m)}
          />
        ))}
      </div>
      <ChangelogRail
        {...filters}
        months={view.map(({ month, releases }) => ({ month, count: releases }))}
        current={current}
        onMonth={goToMonth}
      />
    </div>
  );
}
