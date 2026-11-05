import * as Haptics from 'expo-haptics';

// Vibração curta de feedback. Nunca deixa a app falhar se o aparelho não suportar.
export const tap = () => {
  Haptics.selectionAsync().catch(() => {});
};
export const notify = (kind: 'success' | 'warning' | 'error' = 'success') => {
  const type =
    kind === 'success'
      ? Haptics.NotificationFeedbackType.Success
      : kind === 'warning'
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Error;
  Haptics.notificationAsync(type).catch(() => {});
};
