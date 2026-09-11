import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchReminder, updateReminder } from '../api.js';

export function useReminderSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: ['reminder'], queryFn: fetchReminder });

  const mutation = useMutation({
    mutationFn: updateReminder,
    onSuccess: (data) => {
      queryClient.setQueryData(['reminder'], data);
    },
  });

  return {
    ...query,
    save: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
