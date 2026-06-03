const fs = require('fs');
const d = new Date().toISOString();
fs.writeFileSync('C:/Users/rober/.copilot/session-state/7d15eea1-4d69-49e9-bb21-8370594afd6a/events.jsonl',
  JSON.stringify({type: 'session.start', data: {sessionId: '7d15eea1-4d69-49e9-bb21-8370594afd6a', startTime: d}, timestamp: d}) + '\n' +
  JSON.stringify({type: 'tool.execution_start', data: {toolName: 'test'}, timestamp: d}) + '\n'
);

