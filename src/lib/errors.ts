import { ToastProps } from "@/components/Toast";

const errorMessages: Record<number, string> = {
  400: "Your request was malformed. Please check your input and try again.",
  401: "Authentication failed. Please log in again.",
  403: "You do not have permission for this action. Please check your API key.",
  404: "The requested resource could not be found.",
  429: "You have exceeded your request limit. Please wait and try again later.",
  500: "An unexpected error occurred on the server. Please try again later.",
  503: "The service is temporarily unavailable. Please try again in a few moments.",
  504: "The request timed out as it took too long to process. Please try again.",
};

export async function showApiErrorToast(
  response: Response,
  showToast: (message: string, type?: ToastProps["type"]) => void,
) {
  const friendlyMessage = errorMessages[response.status];

  if (friendlyMessage) {
    showToast(friendlyMessage, "error");
    return;
  }

  let detailedMessage = "An unexpected error occurred. Please try again.";
  try {
    const errorData = await response.json();
    if (errorData.error) {
      detailedMessage = errorData.error;
    } else if (errorData.details) {
      detailedMessage = errorData.details;
    }
  } catch (e) {
    // JSON parsing failed, use the default message.
  }

  showToast(detailedMessage, "error");
}
