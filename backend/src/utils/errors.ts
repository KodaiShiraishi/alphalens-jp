export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export const errors = {
  unauthorized: () => new AppError(401, "UNAUTHORIZED", "未ログインです。"),
  forbidden: () => new AppError(403, "FORBIDDEN", "権限がありません。"),
  csrf: () => new AppError(403, "CSRF_TOKEN_INVALID", "CSRFトークンが不正です。"),
  validation: (message = "入力値が不正です。") => new AppError(400, "VALIDATION_ERROR", message),
  stockNotFound: () => new AppError(404, "STOCK_NOT_FOUND", "銘柄が見つかりません。"),
  reportNotFound: () => new AppError(404, "REPORT_NOT_FOUND", "レポートが見つかりません。"),
  watchlistAlreadyExists: () => new AppError(409, "WATCHLIST_ALREADY_EXISTS", "Watchlist登録済みです。"),
  aiProvider: () => new AppError(503, "AI_PROVIDER_ERROR", "AIレポート生成に失敗しました。"),
  marketProvider: () => new AppError(502, "MARKET_DATA_PROVIDER_ERROR", "外部データ取得に失敗しました。")
};
