import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '../../contacts/lib/errors.js';
import { connectWhatsApp, type IChannelConnectDto } from '../api.js';
import { CHANNEL_STATUS_KEY } from '../hooks/useChannelStatus.js';
import { PRESS } from '../lib/press.js';

const VACIO: IChannelConnectDto = { wabaId: '', phoneNumberId: '', accessToken: '' };

/**
 * Conexión pegando IDs y token a mano. Queda plegada: sirve para el número de prueba de Meta y para
 * soporte, no para el camino normal de una empresa.
 */
export function ManualConnectForm(): React.ReactElement {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<IChannelConnectDto>(VACIO);
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conectar = useMutation({
    mutationFn: connectWhatsApp,
    onSuccess: (status) => {
      queryClient.setQueryData(CHANNEL_STATUS_KEY, status);
      setForm(VACIO);
      setError(null);
      toast.success('WhatsApp conectado');
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo guardar la conexión. Revisa los datos.')),
  });

  function campo(field: keyof IChannelConnectDto): (e: React.ChangeEvent<HTMLInputElement>) => void {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value.trim() }));
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);
    conectar.mutate(form);
  }

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="manual" className="border-b-0">
        <AccordionTrigger className="text-secondary-foreground hover:text-foreground hover:no-underline">
          Conexión manual (avanzado)
        </AccordionTrigger>
        <AccordionContent>
          <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6">
            <p className="max-w-prose text-sm text-secondary-foreground">
              Para el número de prueba de Meta o si soporte te lo indica. Copia los datos desde tu app
              en developers.facebook.com. No activa el número ni suscribe los webhooks por ti.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wabaId">WABA ID</Label>
                <Input id="wabaId" value={form.wabaId} onChange={campo('wabaId')} placeholder="123456789012345" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phoneNumberId">Phone Number ID</Label>
                <Input
                  id="phoneNumberId"
                  value={form.phoneNumberId}
                  onChange={campo('phoneNumberId')}
                  placeholder="987654321098765"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="accessToken">Access token</Label>
              <div className="relative">
                <Input
                  id="accessToken"
                  type={showToken ? 'text' : 'password'}
                  value={form.accessToken}
                  onChange={campo('accessToken')}
                  placeholder="EAAB…"
                  autoComplete="off"
                  required
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowToken((v) => !v)}
                  aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}
                  className="absolute right-0 top-0 text-secondary-foreground hover:bg-transparent hover:text-foreground"
                >
                  {showToken ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" variant="secondary" disabled={conectar.isPending} className={PRESS}>
              {conectar.isPending && <Loader2 className="motion-safe:animate-spin" />}
              {conectar.isPending ? 'Guardando…' : 'Guardar conexión'}
            </Button>
          </form>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
