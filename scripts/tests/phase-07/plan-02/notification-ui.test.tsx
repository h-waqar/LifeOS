import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { NotificationItem } from "@/components/notifications/notification-item";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { AppShell } from "@/components/app-shell";
import type { NotificationDTO } from "@/types";

const MOCK_SESSION = {
  data: { user: { id: "user_test_ui", name: "Hamza Test", email: "hamza@example.com" } },
  isPending: false,
};

// Mock auth-client session
vi.mock("@/lib/auth-client", () => ({
  useSession: () => MOCK_SESSION,
  signOut: vi.fn(),
}));

// Mock theme-provider
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    theme: "dark",
    resolvedTheme: "dark",
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
  }),
}));

// Mock Next.js navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRefresh = vi.fn();
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
  refresh: mockRefresh,
};

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Plan 07-02: Notification UI Components", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const mockNotif: NotificationDTO = {
    id: "notif-1",
    userId: "user_test_ui",
    title: "Daily Plan Reminder",
    message: "Remember to complete your evening review.",
    type: "reminder",
    entityType: "system",
    entityId: null,
    linkUrl: "/daily-plan",
    isRead: false,
    readAt: null,
    metadata: { silenced: true, duringQuietHours: true },
    createdAt: new Date().toISOString(),
  };

  describe("NotificationItem Component", () => {
    it("renders notification title, message, and quiet hours badge", () => {
      render(
        <NotificationItem
          notification={mockNotif}
          onMarkAsRead={vi.fn()}
          onDelete={vi.fn()}
          onNavigate={vi.fn()}
        />
      );

      expect(screen.getByText("Daily Plan Reminder")).toBeDefined();
      expect(
        screen.getByText("Remember to complete your evening review.")
      ).toBeDefined();
      expect(screen.getByText("Quiet Hours")).toBeDefined();
      expect(screen.getByTestId("notification-item-notif-1")).toBeDefined();
    });

    it("triggers onMarkAsRead when mark-read button is clicked", () => {
      const handleMarkRead = vi.fn();
      render(
        <NotificationItem
          notification={mockNotif}
          onMarkAsRead={handleMarkRead}
          onDelete={vi.fn()}
          onNavigate={vi.fn()}
        />
      );

      const markBtn = screen.getByTestId("mark-read-button-notif-1");
      fireEvent.click(markBtn);
      expect(handleMarkRead).toHaveBeenCalledWith("notif-1");
    });

    it("triggers onDelete when delete button is clicked", () => {
      const handleDelete = vi.fn();
      render(
        <NotificationItem
          notification={mockNotif}
          onMarkAsRead={vi.fn()}
          onDelete={handleDelete}
          onNavigate={vi.fn()}
        />
      );

      const delBtn = screen.getByTestId("delete-button-notif-1");
      fireEvent.click(delBtn);
      expect(handleDelete).toHaveBeenCalledWith("notif-1");
    });

    it("triggers onNavigate when clicked on item with linkUrl", () => {
      const handleNavigate = vi.fn();
      const handleMarkRead = vi.fn();
      render(
        <NotificationItem
          notification={mockNotif}
          onMarkAsRead={handleMarkRead}
          onDelete={vi.fn()}
          onNavigate={handleNavigate}
        />
      );

      const item = screen.getByTestId("notification-item-notif-1");
      fireEvent.click(item);

      expect(handleMarkRead).toHaveBeenCalledWith("notif-1");
      expect(handleNavigate).toHaveBeenCalledWith("/daily-plan");
    });
  });

  describe("NotificationCenter Component", () => {
    beforeEach(() => {
      // Mock global fetch
      global.fetch = vi.fn((url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes("/api/notifications/unread-count")) {
          return Promise.resolve(
            new Response(JSON.stringify({ unreadCount: 2 }), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          );
        }
        if (urlStr.includes("/api/notifications")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                notifications: [
                  mockNotif,
                  {
                    ...mockNotif,
                    id: "notif-2",
                    title: "Task Completed",
                    type: "success",
                    isRead: true,
                    readAt: new Date().toISOString(),
                    metadata: {},
                  },
                ],
                total: 2,
                unreadCount: 1,
              }),
              {
                status: 200,
                headers: { "content-type": "application/json" },
              }
            )
          );
        }
        return Promise.resolve(new Response("{}", { status: 200 }));
      }) as any;
    });

    it("renders bell button and badge counter", async () => {
      render(<NotificationCenter />);

      const bellButton = screen.getByTestId("notification-bell-button");
      expect(bellButton).toBeDefined();

      await waitFor(() => {
        const badge = screen.getByTestId("notification-badge");
        expect(badge.textContent).toBe("2");
      });
    });

    it("opens popover on click and renders notifications list", async () => {
      render(<NotificationCenter />);

      const bellButton = screen.getByTestId("notification-bell-button");
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByTestId("notification-popover")).toBeDefined();
        expect(screen.getByText("Notifications")).toBeDefined();
        expect(screen.getByText("Daily Plan Reminder")).toBeDefined();
        expect(screen.getByText("Task Completed")).toBeDefined();
      });
    });

    it("allows marking all notifications as read", async () => {
      render(<NotificationCenter />);

      const bellButton = screen.getByTestId("notification-bell-button");
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByTestId("mark-all-read-button")).toBeDefined();
      });

      const markAllBtn = screen.getByTestId("mark-all-read-button");
      fireEvent.click(markAllBtn);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/notifications/read-all",
          expect.objectContaining({ method: "POST" })
        );
      });
    });
  });

  describe("AppShell Header Integration", () => {
    it("mounts NotificationCenter within AppShell", async () => {
      render(
        <AppShell>
          <div data-testid="page-content">Dashboard Content</div>
        </AppShell>
      );

      // Verify page content renders
      expect(screen.getByTestId("page-content")).toBeDefined();

      // Verify notification bell is mounted in header/sidebar
      await waitFor(() => {
        const bellButtons = screen.getAllByTestId("notification-bell-button");
        expect(bellButtons.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
