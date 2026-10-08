/** Query de `GET /reports/by-advisor`. Fechas `YYYY-MM-DD`; sin ellas, el backend usa 30 días. */
export interface AdvisorReportParams {
  desde?: string;
  hasta?: string;
}
