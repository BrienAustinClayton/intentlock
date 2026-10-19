import { ToastTypeEnum } from "@/shared/enums";
import { ToastItem, ToastListener } from "@/shared/types";

const listeners: ToastListener[] = [];
const currentToasts: ToastItem[] = [];

function notifyListeners(): void {
  const snapshot: ToastItem[] = [...currentToasts];
  listeners.forEach((listener: ToastListener) => {
    listener(snapshot);
  });
}

export function subscribeToasts(listener: ToastListener): () => void {
  listeners.push(listener);
  listener([...currentToasts]);
  return () => {
    const listenerIndex = listeners.indexOf(listener);
    const hasListener = listenerIndex > -1;
    if (hasListener) {
      listeners.splice(listenerIndex, 1);
    }
  };
}

export function removeToast(id: string): void {
  const toastIndex = currentToasts.findIndex((toast: ToastItem) => toast.id === id);
  const toastExists = toastIndex > -1;
  if (toastExists) {
    currentToasts.splice(toastIndex, 1);
    notifyListeners();
  }
}

export function showToast(message: string, type: ToastTypeEnum = ToastTypeEnum.Info): void {
  const generatedId = Math.random().toString(36).substring(2, 9);
  const newToast: ToastItem = { id: generatedId, message, type };
  currentToasts.push(newToast);
  notifyListeners();
  setTimeout(() => {
    removeToast(generatedId);
  }, 4000);
}
