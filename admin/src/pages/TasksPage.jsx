import { useEffect, useState } from "react";
import { postJson } from "../api";

const REWARD_OPTIONS = [
  { value: "none", label: "Без награды" },
  { value: "time", label: "Время" },
  { value: "energy", label: "Энергия" },
  { value: "life", label: "Жизнь" },
];

const TASK_KIND_LABELS = {
  answer: "Ответ",
  max_code: "MAX code",
  telegram_story: "Telegram story",
};

function parseNumericValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "";
  }

  const normalizedValue = String(value ?? "")
    .trim()
    .replace(",", ".");

  if (!normalizedValue) {
    return "";
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : "";
}

function normalizeTask(task) {
  const answerRangeFrom =
    parseNumericValue(task.answerRange?.from) !== ""
      ? parseNumericValue(task.answerRange?.from)
      : parseNumericValue(task.correctAnswer);
  const answerRangeTo =
    parseNumericValue(task.answerRange?.to) !== ""
      ? parseNumericValue(task.answerRange?.to)
      : parseNumericValue(task.correctAnswer);

  return {
    taskId: task.taskId,
    taskNumber: task.taskNumber ?? 0,
    kind: task.kind || "answer",
    correctAnswer: task.correctAnswer || "",
    answerRange: {
      from: answerRangeFrom,
      to: answerRangeTo,
    },
    reward: {
      type: task.reward?.type || "none",
      amount: Number(task.reward?.amount) || 0,
    },
    isActive: Boolean(task.isActive),
  };
}

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingTaskId, setSavingTaskId] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadTasks() {
      try {
        setLoading(true);
        setError("");

        const list = await postJson("/api/tasks/list", {});
        const detailedTasks = await Promise.all(
          list.map((task) => postJson("/api/tasks/get", { taskId: task.taskId }))
        );

        if (!isMounted) {
          return;
        }

        setTasks(
          detailedTasks
            .map(normalizeTask)
            .sort((left, right) => left.taskNumber - right.taskNumber)
        );
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message || "Не удалось загрузить задания");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadTasks();

    return () => {
      isMounted = false;
    };
  }, []);

  function updateTaskField(taskId, updater) {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.taskId === taskId ? updater(task) : task
      )
    );
  }

  async function handleSave(task) {
    try {
      setSavingTaskId(task.taskId);
      setError("");
      setSuccessMessage("");

      if (task.kind === "answer") {
        const answerFrom = parseNumericValue(task.answerRange.from);
        const answerTo = parseNumericValue(task.answerRange.to);

        if (answerFrom === "" || answerTo === "") {
          throw new Error("Заполните оба значения диапазона: от и до");
        }

        if (answerFrom > answerTo) {
          throw new Error("Значение «от» не может быть больше значения «до»");
        }
      }

      const payload = {
        taskId: task.taskId,
        correctAnswer: "",
        answerRange:
          task.kind === "answer"
            ? {
                from: Number(task.answerRange.from),
                to: Number(task.answerRange.to),
              }
            : undefined,
        reward: {
          type: task.reward.type,
          amount: Number(task.reward.amount) || 0,
        },
        isActive: task.isActive,
      };

      const updatedTask = await postJson("/api/tasks/update", payload);

      setTasks((currentTasks) =>
        currentTasks.map((currentTask) =>
          currentTask.taskId === task.taskId
            ? normalizeTask(updatedTask)
            : currentTask
        )
      );
      setSuccessMessage(`Задание ${task.taskNumber} сохранено`);
    } catch (saveError) {
      setError(saveError.message || "Не удалось сохранить задание");
    } finally {
      setSavingTaskId("");
    }
  }

  return (
    <>
      {error ? <div className="admin-message error">{error}</div> : null}
      {successMessage ? (
        <div className="admin-message success">{successMessage}</div>
      ) : null}

      {loading ? (
        <div className="admin-state">Загружаем задания...</div>
      ) : (
        <section className="task-grid">
          {tasks.map((task) => {
            const isSaving = savingTaskId === task.taskId;
            const answerDisabled = task.kind !== "answer";

            return (
              <article className="task-card" key={task.taskId}>
                <div className="task-card-head">
                  <div>
                    <span className="task-label">Задание</span>
                    <h2>#{task.taskNumber}</h2>
                    <p className="task-kind">
                      Тип: {TASK_KIND_LABELS[task.kind] || task.kind}
                    </p>
                  </div>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={task.isActive}
                      onChange={(event) =>
                        updateTaskField(task.taskId, (currentTask) => ({
                          ...currentTask,
                          isActive: event.target.checked,
                        }))
                      }
                    />
                    <span>{task.isActive ? "Активно" : "Выключено"}</span>
                  </label>
                </div>

                <div className="field-group">
                  <label className="field-label">Диапазон ответа</label>
                  <div className="reward-grid">
                    <input
                      id={`answer-from-${task.taskId}`}
                      className="text-input"
                      type="number"
                      value={task.answerRange.from}
                      disabled={answerDisabled}
                      onChange={(event) =>
                        updateTaskField(task.taskId, (currentTask) => ({
                          ...currentTask,
                          answerRange: {
                            ...currentTask.answerRange,
                            from: event.target.value === "" ? "" : Number(event.target.value),
                          },
                        }))
                      }
                      placeholder={answerDisabled ? "Не используется" : "От"}
                    />
                    <input
                      id={`answer-to-${task.taskId}`}
                      className="text-input"
                      type="number"
                      value={task.answerRange.to}
                      disabled={answerDisabled}
                      onChange={(event) =>
                        updateTaskField(task.taskId, (currentTask) => ({
                          ...currentTask,
                          answerRange: {
                            ...currentTask.answerRange,
                            to: event.target.value === "" ? "" : Number(event.target.value),
                          },
                        }))
                      }
                      placeholder={answerDisabled ? "Не используется" : "До"}
                    />
                  </div>
                  <div className="field-hint">
                    Для точного ответа укажите одинаковые значения, например `4` и `4`.
                  </div>
                </div>

                <div className="reward-grid">
                  <div className="field-group">
                    <label
                      className="field-label"
                      htmlFor={`reward-type-${task.taskId}`}
                    >
                      Тип награды
                    </label>
                    <select
                      id={`reward-type-${task.taskId}`}
                      className="text-input"
                      value={task.reward.type}
                      onChange={(event) =>
                        updateTaskField(task.taskId, (currentTask) => ({
                          ...currentTask,
                          reward: {
                            ...currentTask.reward,
                            type: event.target.value,
                          },
                        }))
                      }
                    >
                      {REWARD_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field-group">
                    <label
                      className="field-label"
                      htmlFor={`reward-amount-${task.taskId}`}
                    >
                      Количество
                    </label>
                    <input
                      id={`reward-amount-${task.taskId}`}
                      className="text-input"
                      type="number"
                      min="0"
                      value={task.reward.amount}
                      onChange={(event) =>
                        updateTaskField(task.taskId, (currentTask) => ({
                          ...currentTask,
                          reward: {
                            ...currentTask.reward,
                            amount: Number(event.target.value) || 0,
                          },
                        }))
                      }
                    />
                  </div>
                </div>

                <button
                  className="save-button"
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleSave(task)}
                >
                  {isSaving ? "Сохраняем..." : "Сохранить"}
                </button>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
