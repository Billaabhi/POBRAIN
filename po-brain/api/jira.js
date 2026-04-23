function buildAuthHeader(email, apiToken) {
  const encoded = Buffer.from(`${email}:${apiToken}`).toString('base64');
  return `Basic ${encoded}`;
}

function mapIssue(issue = {}) {
  const fields = issue.fields || {};
  return {
    key: issue.key,
    summary: fields.summary || '',
    status: fields.status?.name || '',
    statusCategory: fields.status?.statusCategory?.key || 'new',
    assignee: fields.assignee?.displayName || 'Unassigned'
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { baseUrl, boardId, email, apiToken } = req.body || {};

  if (!baseUrl || !boardId || !email || !apiToken) {
    return res.status(400).json({ error: 'Missing required fields: baseUrl, boardId, email, apiToken' });
  }

  const cleanBaseUrl = String(baseUrl).replace(/\/$/, '');
  const auth = buildAuthHeader(email, apiToken);
  const headers = {
    Accept: 'application/json',
    Authorization: auth
  };

  try {
    const sprintRes = await fetch(`${cleanBaseUrl}/rest/agile/1.0/board/${boardId}/sprint?state=active`, { headers });
    const sprintData = await sprintRes.json();

    if (!sprintRes.ok) {
      return res.status(sprintRes.status).json({ error: sprintData?.errorMessages?.join(', ') || 'Failed to fetch sprints from JIRA' });
    }

    const sprint = sprintData?.values?.[0];
    if (!sprint) {
      return res.status(200).json({
        baseUrl: cleanBaseUrl,
        sprint: null,
        summary: { todo: 0, inProgress: 0, done: 0 },
        issues: []
      });
    }

    const issueRes = await fetch(`${cleanBaseUrl}/rest/agile/1.0/board/${boardId}/sprint/${sprint.id}/issue?maxResults=100&fields=summary,status,assignee`, { headers });
    const issueData = await issueRes.json();

    if (!issueRes.ok) {
      return res.status(issueRes.status).json({ error: issueData?.errorMessages?.join(', ') || 'Failed to fetch sprint issues from JIRA' });
    }

    const issues = (issueData?.issues || []).map(mapIssue);
    const summary = issues.reduce((acc, issue) => {
      if (issue.statusCategory === 'done') acc.done += 1;
      else if (issue.statusCategory === 'indeterminate') acc.inProgress += 1;
      else acc.todo += 1;
      return acc;
    }, { todo: 0, inProgress: 0, done: 0 });

    return res.status(200).json({
      baseUrl: cleanBaseUrl,
      sprint: {
        id: sprint.id,
        name: sprint.name,
        state: sprint.state,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        goal: sprint.goal || ''
      },
      summary,
      issues
    });
  } catch (error) {
    return res.status(500).json({ error: 'JIRA integration request failed', detail: error.message });
  }
}
