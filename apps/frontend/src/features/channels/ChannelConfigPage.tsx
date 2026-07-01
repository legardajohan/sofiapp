import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  connectWhatsApp,
  getWhatsAppStatus,
  type IChannelConnectDto,
  type IChannelStatusResponse,
} from './api.js';

function StatusBadge({ activo }: { activo: boolean }): React.ReactElement {
  return activo ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      Activo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      Sin configurar
    </span>
  );
}

function Spinner(): React.ReactElement {
  return (
    <svg
      className="animate-spin h-4 w-4 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export function ChannelConfigPage(): React.ReactElement {
  const queryClient = useQueryClient();

  const [form, setForm] = useState<IChannelConnectDto>({
    wabaId: '',
    phoneNumberId: '',
    accessToken: '',
  });
  const [showToken, setShowToken] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: status } = useQuery<IChannelStatusResponse>({
    queryKey: ['channel', 'whatsapp', 'status'],
    queryFn: getWhatsAppStatus,
    retry: false,
  });

  const connectMutation = useMutation({
    mutationFn: connectWhatsApp,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['channel', 'whatsapp', 'status'] });
      setSuccessMsg('Canal conectado exitosamente');
      setErrorMsg(null);
      setForm({ wabaId: data.wabaId, phoneNumberId: data.phoneNumberId, accessToken: '' });
    },
    onError: (err: Error) => {
      setErrorMsg(err.message ?? 'Error al conectar el canal');
      setSuccessMsg(null);
    },
  });

  function handleChange(field: keyof IChannelConnectDto): (e: React.ChangeEvent<HTMLInputElement>) => void {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);
    connectMutation.mutate(form);
  }

  return (
    <div className="min-h-screen bg-[#faf8ff] p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#191b23] tracking-tight">
              Configuración de WhatsApp
            </h1>
            <p className="text-sm text-[#434655] mt-0.5">
              Conecta tu cuenta de WhatsApp Business API al CRM
            </p>
          </div>
        </div>

        {/* Estado del canal */}
        <div className="bg-white border border-[#e1e2ed] rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#191b23]">Estado del canal</p>
            {status?.activo && (
              <div className="mt-1 space-y-0.5">
                <p className="text-xs text-[#434655]">
                  Phone Number ID: <span className="font-mono text-[#191b23]">{status.phoneNumberId}</span>
                </p>
                <p className="text-xs text-[#434655]">
                  WABA ID: <span className="font-mono text-[#191b23]">{status.wabaId}</span>
                </p>
              </div>
            )}
          </div>
          <StatusBadge activo={status?.activo ?? false} />
        </div>

        {/* Formulario de conexión */}
        <div className="bg-white border border-[#e1e2ed] rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
          <div className="px-6 py-5 border-b border-[#e1e2ed]">
            <h2 className="text-base font-semibold text-[#191b23]">Conectar canal</h2>
          </div>
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {/* WABA ID */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[#191b23]" htmlFor="wabaId">
                WABA ID
              </label>
              <input
                id="wabaId"
                type="text"
                value={form.wabaId}
                onChange={handleChange('wabaId')}
                placeholder="Ej. 123456789012345"
                required
                className="w-full px-3 py-2 text-sm border border-[#c3c6d7] rounded-lg bg-white text-[#191b23] placeholder-[#737686] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition-colors"
              />
            </div>

            {/* Phone Number ID */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[#191b23]" htmlFor="phoneNumberId">
                Phone Number ID
              </label>
              <input
                id="phoneNumberId"
                type="text"
                value={form.phoneNumberId}
                onChange={handleChange('phoneNumberId')}
                placeholder="Ej. 987654321098765"
                required
                className="w-full px-3 py-2 text-sm border border-[#c3c6d7] rounded-lg bg-white text-[#191b23] placeholder-[#737686] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition-colors"
              />
            </div>

            {/* Access Token */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[#191b23]" htmlFor="accessToken">
                Access Token
              </label>
              <div className="relative">
                <input
                  id="accessToken"
                  type={showToken ? 'text' : 'password'}
                  value={form.accessToken}
                  onChange={handleChange('accessToken')}
                  placeholder="EAABwz..."
                  required
                  className="w-full px-3 py-2 pr-10 text-sm border border-[#c3c6d7] rounded-lg bg-white text-[#191b23] placeholder-[#737686] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737686] hover:text-[#191b23] transition-colors"
                  aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}
                >
                  {showToken ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Botón conectar */}
            <button
              type="submit"
              disabled={connectMutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#2563eb]/40"
            >
              {connectMutation.isPending ? (
                <>
                  <Spinner />
                  Conectando...
                </>
              ) : (
                'Conectar'
              )}
            </button>
          </form>
        </div>

        {/* Feedback de éxito */}
        {successMsg && (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            <svg className="w-5 h-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {successMsg}
          </div>
        )}

        {/* Feedback de error */}
        {errorMsg && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <svg className="w-5 h-5 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  );
}
