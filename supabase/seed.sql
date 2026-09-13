-- Local development only. `supabase db reset` executes this file; Production
-- releases do not. Slice 4A entry points remain fail-closed without this setting.
alter database postgres set app.world_knowledge_founder_authoring_enabled = 'on';
