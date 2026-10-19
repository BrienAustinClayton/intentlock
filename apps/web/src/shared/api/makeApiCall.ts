import { HttpMethodEnum, ToastTypeEnum } from "@/shared/enums";
import { showToast } from "@/shared/toast/toastManager";
import { ApiCallOptions } from "@/shared/types";
import { ApiCallError } from "./ApiCallError";

export async function makeApiCall<ResponseType, PayloadType = null>(
  options: ApiCallOptions<PayloadType>
): Promise<ResponseType> {
  const method = options.method || HttpMethodEnum.Get;
  const isPostOrPutOrPatch =
    method === HttpMethodEnum.Post ||
    method === HttpMethodEnum.Put ||
    method === HttpMethodEnum.Patch ||
    method === HttpMethodEnum.Delete;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.customHeaders || {}),
  };

  const hasPayload = Boolean(options.payload);
  const bodyContent =
    isPostOrPutOrPatch && hasPayload
      ? JSON.stringify(options.payload)
      : null;

  try {
    const response = await fetch(options.endpoint, {
      method,
      headers,
      body: bodyContent,
      cache: "no-store",
    });

    const isUnauthorized = response.status === 401;
    if (isUnauthorized) {
      if (!options.silent) showToast("Session expired. Please sign in.", ToastTypeEnum.Error);
      throw new ApiCallError(401, "unauthenticated", "Session expired");
    }

    const isFailedRequest = !response.ok;
    if (isFailedRequest) {
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const reason = typeof body.reason === "string" ? body.reason : response.statusText || "Request failed";
      const code = typeof body.error === "string" ? body.error : "http_error";
      if (!options.silent) showToast(reason, ToastTypeEnum.Error);
      throw new ApiCallError(response.status, code, reason, body);
    }

    const responseData: ResponseType = await response.json();
    return responseData;
  } catch (error) {
    if (error instanceof ApiCallError) throw error;
    const finalErrorMessage = error instanceof Error ? error.message : "Network error";
    if (!options.silent) showToast(finalErrorMessage, ToastTypeEnum.Error);
    throw new ApiCallError(0, "network_error", finalErrorMessage);
  }
}
