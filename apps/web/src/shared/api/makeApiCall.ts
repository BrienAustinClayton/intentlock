import { HttpMethodEnum, ToastTypeEnum } from "@/shared/enums";
import { showToast } from "@/shared/toast/toastManager";
import { ApiCallOptions } from "@/shared/types";

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
      showToast("Session expired. Please sign in.", ToastTypeEnum.Error);
      throw new Error("Session expired");
    }

    const isFailedRequest = !response.ok;
    if (isFailedRequest) {
      const errorText = response.statusText || "Request failed";
      showToast(errorText, ToastTypeEnum.Error);
      throw new Error(errorText);
    }

    const responseData: ResponseType = await response.json();
    return responseData;
  } catch (error) {
    const isErrorInstance = error instanceof Error;
    const finalErrorMessage = isErrorInstance ? error.message : "Network error";
    showToast(finalErrorMessage, ToastTypeEnum.Error);
    throw new Error(finalErrorMessage);
  }
}
