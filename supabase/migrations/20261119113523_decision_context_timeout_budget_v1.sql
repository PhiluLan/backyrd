-- The validated regional catalog normally takes 5-8 seconds. The inherited
-- authenticator 8s budget caused valid NukNuk requests to fail before ranking.
-- Give only this existing service-only RPC bounded headroom within the 30s
-- Decision request budget. Body, manifest validation, consent and grants stay intact.
alter function public.backyrd_decision_vnext_product_context_v7(uuid,text,text,text,text,text,text,bigint)
  set statement_timeout = '15s';
notify pgrst, 'reload schema';
