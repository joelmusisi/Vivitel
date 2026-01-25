import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../index.css";

type TaskRow = {
  id: string;
  title: string;
  asset: string;
  assignee: string;
  due: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in-progress" | "blocked" | "done";
};

type QueueRow = {
  id: string;
  label: string;
  count: number;
};

const queues: QueueRow[] = [
  { id: "q-1", label: "Open tasks", count: 24 },
  { id: "q-2", label: "In progress", count: 11 },
  { id: "q-3", label: "Blocked", count: 4 },
  { id: "q-4", label: "Completed", count: 32 }
];

const tasks: TaskRow[] = [
  {
    id: "task-1",
    title: "Investigate harsh brake alert",
    asset: "KBX 204T",
    assignee: "M. Apio",
    due: "Today 17:00",
    priority: "high",
    status: "open"
  },
  {
    id: "task-2",
    title: "Schedule tyre replacement",
    asset: "KDA 923M",
    assignee: "Workshop",
    due: "Tomorrow 10:00",
    priority: "medium",
    status: "in-progress"
  },
  {
    id: "task-3",
    title: "Driver hours review",
    asset: "Fleet Ops",
    assignee: "S. Kato",
    due: "Jan 24",
    priority: "low",
    status: "done"
  },
  {
    id: "task-4",
    title: "Roadside assistance follow-up",
    asset: "KBX 771P",
    assignee: "Dispatch",
    due: "Today 14:30",
    priority: "critical",
    status: "blocked"
  }
];

export default function Tasks() {
  const navigate = useNavigate();
  const [activeQueue, setActiveQueue] = useState("Open tasks");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const summary = useMemo(
    () => [
      { label: "Open", value: tasks.filter((task) => task.status === "open").length },
      { label: "In progress", value: tasks.filter((task) => task.status === "in-progress").length },
      { label: "Blocked", value: tasks.filter((task) => task.status === "blocked").length },
      { label: "Due today", value: 7 }
    ],
    []
  );

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch =
        task.title.toLowerCase().includes(search.toLowerCase()) ||
        task.asset.toLowerCase().includes(search.toLowerCase()) ||
        task.assignee.toLowerCase().includes(search.toLowerCase());
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      return matchesSearch && matchesPriority;
    });
  }, [search, priorityFilter]);

  return (
    <div className="page tasks-page">
      <div className="tasks-topbar">
        <div>
          <div className="tasks-title">Tasks</div>
          <div className="tasks-path">Monitor / Task management / Tasks</div>
        </div>
        <div className="tasks-actions">
          <button
            type="button"
            className="tasks-btn ghost"
            onClick={() =>
              navigate(
                "/measure/insights/reports?category=List%20Reports&report=Summary%20and%20Detailed%20Task%20Report%20by%20Template%20and%20Date"
              )
            }
          >
            View task reports
          </button>
          <button type="button" className="tasks-btn ghost">
            Export
          </button>
          <button
            type="button"
            className="tasks-btn"
            data-modal="Create task"
            data-modal-sub="Assign task details and owner."
            data-modal-fields="Task title|Assignee|Due date"
          >
            Create task
          </button>
        </div>
      </div>

      <section className="tasks-summary">
        {summary.map((card) => (
          <div key={card.label} className="tasks-summary-card">
            <div className="tasks-summary-label">{card.label}</div>
            <div className="tasks-summary-value">{card.value}</div>
          </div>
        ))}
      </section>

      <section className="tasks-layout">
        <aside className="tasks-panel">
          <div className="tasks-panel-header">
            <div>
              <div className="tasks-panel-title">Queues</div>
              <div className="tasks-panel-sub">Task workflows and ownership lists.</div>
            </div>
          </div>
          <div className="tasks-queue-list">
            {queues.map((queue) => (
              <button
                key={queue.id}
                type="button"
                className={`tasks-queue ${activeQueue === queue.label ? "active" : ""}`}
                onClick={() => setActiveQueue(queue.label)}
              >
                <span>{queue.label}</span>
                <span className="tasks-queue-pill">{queue.count}</span>
              </button>
            ))}
          </div>
          <div className="tasks-panel-footer">
            <button type="button" className="tasks-link">Manage queues</button>
          </div>
        </aside>

        <div className="tasks-panel">
          <div className="tasks-panel-header">
            <div>
              <div className="tasks-panel-title">Task list</div>
              <div className="tasks-panel-sub">Showing tasks in {activeQueue}.</div>
            </div>
            <div className="tasks-filter-row">
              <input
                className="tasks-search"
                placeholder="Search tasks"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                className="tasks-select"
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
              >
                <option value="all">All priority</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          <div className="tasks-table">
            <div className="tasks-row tasks-row-head">
              <span>Task</span>
              <span>Asset / Group</span>
              <span>Assignee</span>
              <span>Due</span>
              <span>Priority</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {filteredTasks.length === 0 ? (
              <div className="tasks-empty">No tasks match your filters.</div>
            ) : (
              filteredTasks.map((task) => (
                <div key={task.id} className="tasks-row">
                  <span className="tasks-title-cell">{task.title}</span>
                  <span>{task.asset}</span>
                  <span>{task.assignee}</span>
                  <span>{task.due}</span>
                  <span className={`tasks-pill ${task.priority}`}>{task.priority}</span>
                  <span className={`tasks-status ${task.status}`}>{task.status}</span>
                  <span className="tasks-actions-col">
                    <button type="button" className="tasks-action">Open</button>
                    <button type="button" className="tasks-action ghost">Assign</button>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
