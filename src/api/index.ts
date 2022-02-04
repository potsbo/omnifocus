import { run } from "@jxa/run";

const wrap = <T>(fn: () => T) => {
  return async () => {
    return await run(fn);
  };
};

declare const Application: (_: "OmniFocus") => OmniFocus;

interface OmniFocus {
  document: {
    perspectiveNames: () => [string[]];
    inboxTasks: () => [Task[]];
    projects: () => [Project[]];
  };
}

type Status = "active status" | "on hold status" | "done status" | "dropped status";

interface Project {
  properties: () => {
    effectiveStatus: Status;
    completedByChildren: boolean;
    lastReviewDate: string;
    id: string;
    nextReviewDate: string;
    shouldUseFloatingTimeZone: boolean;
    effectiveDeferDate: unknown;
    repetition: unknown;
    blocked: boolean;
    defaultSingletonActionHolder: boolean;
    primaryTag: unknown;
    modificationDate: string;
    numberOfCompletedTasks: 0;
    effectiveDueDate: unknown;
    effectivelyDropped: boolean;
    repetitionRule: unknown;
    effectivelyCompleted: boolean;
    completionDate: unknown;
    folder: unknown;
    pcls: "project";
    completed: boolean;
    reviewInterval: { unit: string; steps: number; fixed: boolean };
    dueDate: unknown;
    deferDate: unknown;
    name: string;
    sequential: boolean;
    flagged: boolean;
    singletonActionHolder: boolean;
    nextDueDate: unknown;
    note: string;
    creationDate: string;
    nextDeferDate: unknown;
    numberOfTasks: number;
    numberOfAvailableTasks: number;
    estimatedMinutes: unknown;
    dropped: boolean;
    droppedDate: unknown;
    status: Status;
  };
}

interface Task {
  properties: () => {
    nextDeferDate: unknown;
    flagged: boolean;
    shouldUseFloatingTimeZone: boolean;
    nextDueDate: unknown;
    effectivelyDropped: boolean;
    modificationDate: string;
    completionDate: string;
    sequential: boolean;
    completed: boolean;
    repetitionRule: unknown;
    numberOfCompletedTasks: 0;
    estimatedMinutes: unknown;
    numberOfTasks: 0;
    repetition: unknown;
    note: string;
    creationDate: string;
    dropped: boolean;
    blocked: boolean;
    inInbox: boolean;
    pcls: "inboxTask";
    next: boolean;
    numberOfAvailableTasks: 0;
    primaryTag: unknown;
    name: string;
    containingProject: unknown;
    effectiveDueDate: unknown;
    parentTask: unknown;
    completedByChildren: boolean;
    effectiveDeferDate: unknown;
    deferDate: unknown;
    id: string;
    droppedDate: unknown;
    dueDate: unknown;
    effectivelyCompleted: boolean;
  };
  name: () => string;
  assignedContainer: () => undefined | { name: () => string };
}

export const getPerspectives = wrap(() => {
  const app = Application("OmniFocus");
  return app.document.perspectiveNames()[0];
});

export const getInboxTasks = wrap(() => {
  const app = Application("OmniFocus");
  return app.document.inboxTasks()[0].map((t) => t.properties());
});

export const getProjects = wrap(() => {
  const app = Application("OmniFocus");
  return app.document.projects()[0].map((t) => t.properties());
});
