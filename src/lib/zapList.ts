import type { IptvChannel } from '@/hooks/useIptvPlaylist';

/**
 * The list the user last played from, so TV remotes / Xbox pads can zap to the
 * next or previous channel (CH+ / CH- / shoulder buttons) while the player is
 * open. Kept in a module so grids can register without prop drilling.
 */
let list: IptvChannel[] = [];

export function setZapList(channels: IptvChannel[] | null | undefined) {
  list = channels?.length ? channels.slice() : [];
}

export function zapNeighbour(currentId: string | undefined, delta: number): IptvChannel | null {
  if (list.length < 2 || !currentId) return null;
  const i = list.findIndex((c) => c.id === currentId);
  if (i < 0) return null;
  const next = list[(i + delta + list.length) % list.length];
  return next && next.id !== currentId ? next : null;
}
