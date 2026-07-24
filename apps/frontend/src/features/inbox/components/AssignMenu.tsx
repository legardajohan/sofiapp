import { Check, ChevronDown, Loader2, UserRoundCheck, UserRoundX } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { SUBROL_LABEL } from '@/lib/roles';
import { useAuthStore } from '@/stores/authStore';
import { useTenantUsers } from '@/features/users/hooks/useTenantUsers';
import { useAssign } from '../hooks/useAssign.js';
import { personInitials } from '../lib/format.js';

interface Props {
  conversationId: string;
  asignadoA: string | null;
  asignadoANombre: string | null;
}

/** Menú "Asignar a…" de la cabecera del hilo: asignármela, reasignar o quitar (HU-OMNI-02). */
export function AssignMenu({ conversationId, asignadoA, asignadoANombre }: Props): React.ReactElement {
  const me = useAuthStore((s) => s.user);
  const { data: admins } = useTenantUsers();
  const assign = useAssign(conversationId);

  const pending = assign.isPending;
  const soyElResponsable = !!me && asignadoA === me.sub;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending} className="gap-1.5">
          {asignadoANombre ? (
            <Avatar className="h-4 w-4">
              <AvatarFallback className="text-[8px] font-medium">
                {personInitials(asignadoANombre)}
              </AvatarFallback>
            </Avatar>
          ) : null}
          <span className="max-w-32 truncate">{asignadoANombre ?? 'Sin asignar'}</span>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Asignar a</DropdownMenuLabel>
        {!soyElResponsable && me ? (
          <DropdownMenuItem disabled={pending} onClick={() => assign.mutate(me.sub)}>
            <UserRoundCheck className="h-4 w-4" />
            Asignármela
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        {admins?.map((admin) => {
          const selected = admin.id === asignadoA;
          return (
            <DropdownMenuItem
              key={admin.id}
              disabled={pending || selected}
              onClick={() => assign.mutate(admin.id)}
            >
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[9px] font-medium">
                  {personInitials(admin.nombre)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate">
                {admin.nombre}
                {admin.subrol ? (
                  <span className="text-muted-foreground"> · {SUBROL_LABEL[admin.subrol]}</span>
                ) : null}
              </span>
              {selected ? <Check className="h-4 w-4 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending || !asignadoA}
          onClick={() => assign.mutate(null)}
          className={cn(!!asignadoA && 'text-destructive focus:text-destructive')}
        >
          <UserRoundX className="h-4 w-4" />
          Quitar asignación
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
