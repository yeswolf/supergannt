declare module 'dhtmlx-gantt' {
  type TaskClassFn = (
    start: Date,
    end: Date,
    task: { critical?: boolean; [key: string]: unknown },
  ) => string

  interface GanttStatic {
    plugins(config: Record<string, boolean>): void
    config: Record<string, unknown>
    templates: {
      task_class: TaskClassFn
      [key: string]: unknown
    }
    init(container: HTMLElement): void
    clearAll(): void
    parse(data: unknown): void
    getTask(id: string | number): {
      start_date: Date
      end_date: Date
      duration: number
      progress: number
    }
    isTaskExists(id: string | number): boolean
    selectTask(id: string | number): void
    attachEvent(name: string, handler: (...args: any[]) => any): string
    detachEvent(id: string): void
  }

  const gantt: GanttStatic
  export default gantt
}
