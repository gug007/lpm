import { z } from "zod";
import { slugify } from "../slugify";

/** Project name: any input that slugifies to a non-empty string. */
export const projectNameSchema = z
  .string()
  .refine((v) => slugify(v).length > 0, "Enter a project name.");

/** Branch name for newly created branches. Slashes are allowed (e.g. feat/foo). */
export const newBranchNameSchema = z
  .string()
  .refine(
    (v) => slugify(v, { allowSlash: true }).length > 0,
    "Enter a branch name.",
  );

/** Git remote URL. Backend re-validates the format. */
export const gitUrlSchema = z
  .string()
  .trim()
  .min(1, "Enter a repository URL.");

export const sshHostSchema = z.string().trim().min(1, "Enter a host.");

export const sshUserSchema = z.string().trim().min(1, "Enter a user.");

/** TCP port. Empty input is allowed and resolved to a default by the caller. */
export const portInputSchema = z
  .string()
  .trim()
  .refine(
    (v) => {
      if (v === "") return true;
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 65535;
    },
    "Port must be 1–65535.",
  );

interface SlugifiedNameOptions {
  emptyMessage: string;
  entity: string;
  editingName: string | null;
  otherNames: string[];
}

/**
 * Schema for a free-text name field whose slugified form must be unique against
 * `otherNames` when editing. Used by forms that mint YAML keys from user input.
 */
export function slugifiedNameSchema(opts: SlugifiedNameOptions) {
  const { emptyMessage, entity, editingName, otherNames } = opts;
  return z
    .string()
    .trim()
    .min(1, emptyMessage)
    .superRefine((v, ctx) => {
      if (!editingName) return;
      const slug = slugify(v) || editingName;
      if (otherNames.includes(slug)) {
        ctx.addIssue({
          code: "custom",
          message: `A ${entity} named "${slug}" already exists`,
        });
      }
    });
}
