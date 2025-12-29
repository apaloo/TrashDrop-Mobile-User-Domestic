const { realTableInspector } = require('../src/utils/realTableInspector.js');

async function inspect() {
  try {
    const results = await realTableInspector.inspectBatchesTable();
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

inspect();
