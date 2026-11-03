import type { Seed } from "../types";
import { AUTH_SERVICE } from "./auth-service";
import { AUTH_SERVICE_FOLDER } from "./auth-service-folder";
import { DOCS_SITE } from "./docs-site";
import { NEW_FOLDERS } from "./folders";
import { SAMPLE_JOB_HISTORY, SAMPLE_JOBS } from "./jobs";
import { SAMPLE_LPM_COMMANDS } from "./lpm-commands";
import { ML_PIPELINE } from "./ml-pipeline";
import { MOBILE_APP } from "./mobile-app";
import { SAAS_APP } from "./saas-app";
import { sampleRecap } from "./recap";
import { sampleStats } from "./stats";
import { SAMPLE_ACCOUNT_USAGE, SAMPLE_ACCOUNTS_STATUS, sampleLimits } from "./usage";

export { isBinary } from "./generate";

export const SAMPLE: Seed = {
  projects: [SAAS_APP, AUTH_SERVICE, DOCS_SITE, ML_PIPELINE, MOBILE_APP],
  folders: [...NEW_FOLDERS, AUTH_SERVICE_FOLDER],
  sshHosts: [
    { alias: "devbox", host: "devbox.local", user: "you", port: 0 },
    { alias: "build-server", host: "10.0.4.17", user: "ci", port: 0 },
    { alias: "staging", host: "staging.example.com", user: "deploy", port: 2222 },
  ],
  jobs: SAMPLE_JOBS,
  jobHistory: SAMPLE_JOB_HISTORY,
  lpmCommands: SAMPLE_LPM_COMMANDS,
  usage: {
    limits: sampleLimits(),
    accountsStatus: SAMPLE_ACCOUNTS_STATUS,
    accountUsage: SAMPLE_ACCOUNT_USAGE,
  },
  stats: sampleStats,
  recap: sampleRecap,
};
