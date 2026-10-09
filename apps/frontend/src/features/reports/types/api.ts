/** Query común de los reportes de tenant. Fechas `YYYY-MM-DD`; sin ellas, el backend usa 30 días. */
export interface ReportRangeParams {
  desde?: string;
  hasta?: string;
}

/** Query de `GET /reports/by-advisor` (HU-REP-01). */
export type AdvisorReportParams = ReportRangeParams;

/** Query de `GET /reports/handoff-rate` (HU-REP-02). */
export type HandoffRateParams = ReportRangeParams;
