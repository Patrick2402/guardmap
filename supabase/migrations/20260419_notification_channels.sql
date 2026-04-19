-- notification_channels: stores Slack (and future) webhook configs per org.
-- One row per org per type (enforced by unique index).

CREATE TABLE public.notification_channels (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type            text        NOT NULL DEFAULT 'slack' CHECK (type = 'slack'),
  webhook_url     text        NOT NULL,
  channel_name    text,
  enabled         boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX notification_channels_org_type_idx
  ON public.notification_channels (organization_id, type);

ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;

-- All org members can read
CREATE POLICY "Members can view their org notification channels"
  ON public.notification_channels FOR SELECT
  USING (organization_id IN (SELECT public.get_my_org_ids()));

-- Only admins can write
CREATE POLICY "Admins can manage notification channels"
  ON public.notification_channels FOR ALL
  USING (public.has_org_role(organization_id, 'admin'::public.org_role))
  WITH CHECK (public.has_org_role(organization_id, 'admin'::public.org_role));


-- ── get_notification_config ────────────────────────────────────────────────────
-- Called by the agent before submitting a scan.
-- Returns: webhook_url (null if not configured), last_findings, last_score.
-- The agent diffs current findings against last_findings to find new ones.

CREATE OR REPLACE FUNCTION public.get_notification_config(
  p_api_key     text,
  p_cluster_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      uuid;
  v_webhook_url text;
  v_last_findings jsonb;
  v_last_score  int;
BEGIN
  -- Validate API key
  SELECT ak.organization_id INTO v_org_id
  FROM public.api_keys ak
  WHERE encode(digest(p_api_key, 'sha256'), 'hex') = ak.key_hash
    AND ak.revoked_at IS NULL
    AND (ak.expires_at IS NULL OR ak.expires_at > now());

  IF v_org_id IS NULL THEN
    RETURN json_build_object('webhook_url', null::text, 'last_findings', '[]'::json, 'last_score', 100);
  END IF;

  -- Check if Slack is configured and enabled
  SELECT nc.webhook_url INTO v_webhook_url
  FROM public.notification_channels nc
  WHERE nc.organization_id = v_org_id
    AND nc.type = 'slack'
    AND nc.enabled = true;

  IF v_webhook_url IS NULL THEN
    RETURN json_build_object('webhook_url', null::text, 'last_findings', '[]'::json, 'last_score', 100);
  END IF;

  -- Fetch previous scan findings + score for this cluster
  SELECT sr.findings, sr.security_score INTO v_last_findings, v_last_score
  FROM public.scan_results sr
  JOIN public.clusters c ON c.id = sr.cluster_id
  WHERE c.organization_id = v_org_id
    AND c.name = p_cluster_name
    AND c.deleted_at IS NULL
  ORDER BY sr.scanned_at DESC
  LIMIT 1;

  RETURN json_build_object(
    'webhook_url',    v_webhook_url,
    'last_findings',  COALESCE(v_last_findings, '[]'::jsonb),
    'last_score',     COALESCE(v_last_score, 100)
  );
END;
$$;


-- ── test_slack_notification ────────────────────────────────────────────────────
-- Called from the dashboard "Test" button.
-- Uses pg_net for a server-side POST to avoid browser CORS restrictions.

CREATE OR REPLACE FUNCTION public.test_slack_notification(
  p_org_id     uuid,
  p_webhook_url text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_org_role(p_org_id, 'admin'::public.org_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM net.http_post(
    url     := p_webhook_url,
    body    := json_build_object(
      'text', ':white_check_mark: *GuardMap* Slack integration is working! You will receive alerts when new security findings are detected in your cluster.'
    )::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  RETURN json_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$$;
