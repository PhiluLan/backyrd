-- Public, verified World contact facts were present in the manifest but
-- hidden by the presentation policy. Make them visible on both Spot surfaces;
-- this does not change World resolution or Decision ranking.
update world_knowledge_private.spot_detail_presentation_policy_v1
set mobile_visible = true,
    web_visible = true,
    updated_at = clock_timestamp()
where registry_version = 'backyrd.world-knowledge.registry@2.1'
  and attribute_key in (
    'contact.public_email', 'contact.instagram',
    'contact.facebook', 'contact.tiktok'
  )
  and public_allowed = true;
