import { useCallback, useMemo, useState } from "react";
import SortableColumnHeader from "../../components/SortableColumnHeader";
import { useColumnSort } from "../../hooks/useColumnSort";
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

export default function Tasks() {
  const navigate = useNavigate();
  const [activeQueue, setActiveQueue] = useState("Open tasks");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const tasks: TaskRow[] = [];

  const queues = useMemo(
    () => [
      { id: "q-1", label: "Open tasks", count: 0 },
      { id: "q-2", label: "In progress", count: 0 },
      { id: "q-3", label: "Blocked", count: 0 },
      { id: "q-4", label: "Completed", count: 0 }
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
  }, [tasks, search, priorityFilter]);

  const hasActiveFilters = search.trim().length > 0 || priorityFilter !== "all";

  const getTaskSortValue = useCallback((row: TaskRow, key: string) => {
    if (key === "task") return row.title;
    if (key === "asset") return row.asset;
    if (key === "assignee") return row.assignee;
    if (key === "due") return row.due;
    if (key === "priority") return row.priority;
    if (key === "status") return row.status;
    return "";
  }, []);
  const taskSort = useColumnSort({ rows: filteredTasks, getValue: getTaskSortValue });

  return (
    <div className="page tasks-page">
      <div className="tasks-topbar">
        <div>
          <div className="tasks-title">Tasks</div>
          <div className="tasks-path">Track / Task Controlment / Tasks</div>
        </div>
        <div className="tasks-actions">
          <button
            type="button"
            className="tasks-btn ghost"
            onClick={() =>
              navigate(
                "/Analyze/insights/reports?category=List%20Reports&report=Summary%20and%20Detailed%20Task%20Report%20by%20Template%20and%20Date"
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
            <button type="button" className="tasks-link">Control queues</button>
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
              <SortableColumnHeader as="span" label="Task" {...taskSort.getHeaderProps("task")} />
              <SortableColumnHeader as="span" label="Asset / Group" {...taskSort.getHeaderProps("asset")} />
              <SortableColumnHeader as="span" label="Assignee" {...taskSort.getHeaderProps("assignee")} />
              <SortableColumnHeader as="span" label="Due" {...taskSort.getHeaderProps("due")} />
              <SortableColumnHeader as="span" label="Priority" {...taskSort.getHeaderProps("priority")} />
              <SortableColumnHeader as="span" label="Status" {...taskSort.getHeaderProps("status")} />
              <span>Actions</span>
            </div>
            {taskSort.sortedRows.length === 0 ? (
              <div className="tasks-empty">
                {hasActiveFilters ? "No tasks match your filters." : "No records yet."}
              </div>
            ) : (
              taskSort.sortedRows.map((task) => (
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
