import * as Haptics from 'expo-haptics';

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
