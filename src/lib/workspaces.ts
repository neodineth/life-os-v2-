import { z } from "zod";
export const workspaceNames = ["University 01", "University 02", "Startup 01", "Startup 02", "Personal Growth"] as const;
export const customWorkspaceSchema = z.string().regex(/^custom:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "Invalid workspace ID");
export const workspaceIdSchema = z.union([z.enum(workspaceNames), customWorkspaceSchema]);
export const workspaceNameSchema = z.string().trim().min(1, "Enter a workspace name").max(50, "Use no more than 50 characters");
