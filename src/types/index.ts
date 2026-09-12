export type ProjectStatus = "planning" | "active" | "paused" | "completed" | "archived";
export type Priority = "low" | "medium" | "high" | "critical";

export type TaskStatus =
  | "inbox"
  | "todo"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";

export interface ProjectDTO {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDTO {
  id: string;
  userId: string;
  projectId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  estimatedDuration: number | null;
  actualDuration: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferencesDTO {
  id: string;
  userId: string;
  theme: "dark" | "light" | "system";
  dateFormat: string;
  timeFormat: "12h" | "24h";
  workingHoursStart: string;
  workingHoursEnd: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUserDTO {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
