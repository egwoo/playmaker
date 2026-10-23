import type { SupabaseClient } from '@supabase/supabase-js';
import { deserializePlay, serializePlay, type Play } from './model';

export type PlayCopySource = {
  name: string;
  play: Play;
  notes: string;
  tags: { name: string; color: string }[];
};

export function snapshotPlayForCopy(source: PlayCopySource): PlayCopySource {
  const play = deserializePlay(serializePlay(source.play));
  if (!play) {
    throw new Error('Unable to copy this play.');
  }
  return { ...source, play, tags: source.tags.map((tag) => ({ ...tag })) };
}

export async function copyPlayToPlaybook(
  client: SupabaseClient,
  source: PlayCopySource,
  destinationPlaybookId: string,
  name: string,
  userId: string
): Promise<{ id: string; name: string }> {
  const copy = snapshotPlayForCopy(source);
  const tags = new Map<string, { name: string; color: string }>();
  copy.tags.forEach((tag) => {
    const normalized = tag.name.trim().replace(/\s+/g, ' ');
    if (normalized && !tags.has(normalized.toLowerCase())) {
      tags.set(normalized.toLowerCase(), { ...tag, name: normalized });
    }
  });

  if (tags.size > 0) {
    const { data, error } = await client
      .from('playbook_tags')
      .select('name, sort_order')
      .eq('playbook_id', destinationPlaybookId);
    if (error) {
      throw error;
    }
    const existing = new Map<string, string>();
    let sortOrder = 0;
    (data ?? []).forEach((tag) => {
      existing.set(tag.name.trim().toLowerCase(), tag.name);
      sortOrder = Math.max(sortOrder, tag.sort_order ?? 0);
    });
    const missing = Array.from(tags.entries())
      .filter(([key]) => !existing.has(key))
      .map(([, tag]) => ({
        playbook_id: destinationPlaybookId,
        name: tag.name,
        color: tag.color,
        sort_order: (sortOrder += 10),
        created_by: userId
      }));
    if (missing.length > 0) {
      const { error: tagError } = await client.from('playbook_tags').upsert(missing, {
        onConflict: 'playbook_id,name',
        ignoreDuplicates: true
      });
      if (tagError) {
        throw tagError;
      }
    }
    tags.forEach((tag, key) => {
      tag.name = existing.get(key) ?? tag.name;
    });
  }

  const { data, error } = await client
    .from('plays')
    .insert({
      playbook_id: destinationPlaybookId,
      name: name.trim(),
      data: copy.play,
      notes: copy.notes,
      tags: Array.from(tags.values(), (tag) => tag.name)
    })
    .select('id, name')
    .single();
  if (error || !data) {
    throw error ?? new Error('Unable to copy this play.');
  }
  return { id: data.id, name: data.name };
}
