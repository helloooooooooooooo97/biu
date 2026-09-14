import { test } from 'vitest'
import assert from 'node:assert/strict'
import { REPORT_SCOPE, buildReportFragment, itemTitle, reportCss } from './report.ts'
import { TOOLS, type ReportCategory, type ReportItem } from './model.ts'
import { PICK_KIND, reportBlockKey, stampReportHtml } from './stamp-picks.ts'

function item(
  id: string,
  category: ReportCategory,
  renderTool: string,
  data: unknown,
  extra: Partial<ReportItem> = {},
): ReportItem {
  return {
    id,
    seq: Number(id.replace(/\D/g, '')) || 1,
    turn: 1,
    category,
    sourceTool: renderTool,
    renderTool,
    args: { product: 'CDB', ip: '11.40.182.17', port: 20132 },
    state: 'ok',
    data,
    enriched: false,
    ...extra,
  }
}

test('only populated whitelist categories appear, in the fixed diagnostic order', () => {
  const html = buildReportFragment({
    items: [
      item('host1', 'host-load', TOOLS.hostLoad, { records: [{ timestamp: 'x', load_1min: 1 }] }),
      item('meta1', 'metadata', 'cdb.metadata.list_instance_metainfo_cdb_preprocess', { instance_meta: { id: 'x' } }),
      item('slow1', 'slow', TOOLS.slowAnalyzed, { records: [{ sql_template: 'select 1', count: 1 }] }),
    ],
  })
  assert.ok(html.indexOf('元数据') < html.indexOf('Slow Log'))
  assert.ok(html.indexOf('Slow Log') < html.indexOf('Host Load'))
  assert.doesNotMatch(html, /Processlist|Iostat 设备趋势|Iotop 快照/)
})

test('metadata flattens business values and drops top-level control fields', () => {
  const html = buildReportFragment({
    items: [
      item('meta1', 'metadata', 'cdb.metadata.list_instance_metainfo_cdb_preprocess', {
        data_status: 'ok',
        start_time: '2026-09-10 15:00:00',
        end_time: '2026-09-10 16:00:00',
        extra_metadata: {
          instance_summary: {
            instance_id: 'cdb-demo',
            instance_name: 'orders-primary',
            long_instance_id: 'uuid-demo',
            region: 'ap-beijing',
            vip: '10.0.0.8',
            vport: 3306,
            total_nodes: 2,
            master_count: 1,
            slave_count: 1,
            owner: { app_id: '1250000000', company_name: '示例公司' },
          },
          topology_nodes: [
            {
              node_info: { ip: '11.1.2.3', port: 20123, db_version: 'mysql-txsql-8.0.30' },
              resource_info: { cpu: 4, quota_mem: 8192, quota_disk: 500, xtype: 'common' },
              status_info: { node_status: 'online', set_status: 'NORMAL' },
              network_info: { server_device_class: 'Y0-SH02-25G', inner_switch_ip: '29.1.1.1' },
              sets: [{ instance_id: 'cdb-demo', oss_cluster_id: '323', disk_partition: 'data4' }],
            },
          ],
        },
        instance_meta: {
          instance_id: 'cdb-demo',
          app_id: '1250000000',
          oss_cluster_id: '323',
        },
        master_timeline: {
          ip_durations: [{ ip: '11.1.2.3', port: 20123, start: '2026-09-10 15:00:00', end: '2026-09-10 16:00:00' }],
        },
        slave_timelines: [
          { line: 's0', ip_durations: [{ ip: '11.1.2.4', port: 20124, start: '2026-09-10 15:00:00', end: '2026-09-10 16:00:00' }] },
        ],
        query_cluster_scope: { region: 'ap-beijing', queried_oss_clusters: ['321', '323'] },
        timezone: 'Asia/Shanghai',
      }),
    ],
  })
  assert.match(html, /class="skin-grid"/)
  assert.match(html, /实例元数据/)
  assert.match(html, /orders-primary/)
  assert.match(html, /cdb-demo/)
  assert.match(html, /ap-beijing/)
  assert.match(html, /10\.0\.0\.8/)
  assert.match(html, /3306/)
  assert.match(html, /示例公司/)
  assert.match(html, />节点</)
  assert.match(html, /11\.1\.2\.3:20123/)
  assert.match(html, /mysql-txsql-8\.0\.30/)
  assert.match(html, />主库</)
  assert.match(html, />s0</)
  assert.doesNotMatch(html, /server_device_class/)
  assert.doesNotMatch(html, /queried_oss_clusters/)
  assert.doesNotMatch(html, /data_status|start_time|end_time/)
})

test('processlist is grouped by timestamp with exactly the requested eight columns', () => {
  const html = buildReportFragment({
    items: [
      item('p1', 'processlist', TOOLS.processRaw, {
        title: ['timestamp', 'ID', 'USER', 'HOST', 'db', 'COMMAND', 'TIME', 'STATE', 'INFO'],
        snapshots: [
          {
            timestamp: '2026-09-10 15:30:28',
            total: 1,
            data: [['2026-09-10 15:30:28', '2', 'bob', '10.0.0.2', 'db2', 'Query', '9', 'executing', 'select 2']],
          },
          {
            timestamp: '2026-09-10 15:30:23',
            total: 2,
            data: [
              ['2026-09-10 15:30:23', '1', 'alice', '10.0.0.1', 'db1', 'Query', '5', 'Sending data', 'select 1'],
              ['2026-09-10 15:30:23', '3', 'root', '', null, 'Sleep', '1', '', null],
            ],
          },
        ],
      }),
    ],
  })
  const text = html.replace(/&quot;/g, '"')
  assert.ok(text.indexOf('15:30:23') < text.indexOf('15:30:28'), '快照按时间升序')
  assert.match(text, /---------------2026-09-10 15:30:23---------------/)
  assert.match(text, /ID,USER,HOST,db,COMMAND,TIME,STATE,INFO/)
  assert.match(text, /1,alice,10\.0\.0\.1,db1,Query,5,Sending data,select 1/)
  // 行内不再重复 timestamp 列
  assert.doesNotMatch(text, /timestamp,ID,USER/)
})

test('analyzed slow logs are flat cards with SQL on its own full row', () => {
  const html = buildReportFragment({
    items: [
      item('s1', 'slow', TOOLS.slowAnalyzed, {
        records: [
          {
            rank: 1,
            count: 42,
            avg_time_sec: 1.2,
            avg_rows_examined: 6638,
            sql_template_hash: '0xABC',
            sql_template: 'SELECT * FROM orders WHERE id = ?',
          },
          { rank: 2, count: 8, sql_template: 'UPDATE users SET name = ?' },
        ],
      }),
    ],
  })
  assert.equal((html.match(/class="flat-card"/g) || []).length, 2)
  assert.match(html, /class="flat-sql"/)
  assert.match(html, /SELECT \* FROM orders/)
  assert.match(html, /avg_rows_examined/)
})

test('raw slow logs follow MySQL slow-log text and ignore absent fields', () => {
  const html = buildReportFragment({
    items: [
      item('s1', 'slow', TOOLS.slowRaw, {
        records: [
          {
            log_timestamp: '2026-06-30 08:00:41',
            user_name: 'root',
            user_host: '30.186.150.241',
            thread_id: 147083567,
            query_time: 32.437896,
            lock_time: 0.373687,
            rows_sent: 0,
            rows_examined: 6638,
            sql_raw_text: 'SELECT * FROM t;',
          },
        ],
      }),
    ],
  })
  assert.match(html, /# Time: 260630  8:00:41/)
  assert.match(html, /# User@Host: root\[root\] @  \[30\.186\.150\.241\]  Id: 147083567/)
  assert.match(html, /# Query_time: 32\.437896  Lock_time: 0\.373687 Rows_sent: 0  Rows_examined: 6638/)
  assert.match(html, /SET timestamp=1782777641;/)
  assert.match(html, /SELECT \* FROM t;/)
  assert.doesNotMatch(html, /undefined|null/)
})

test('innodb trx uses snapshot headings and prints every returned transaction field', () => {
  const html = buildReportFragment({
    items: [
      item('t1', 'innodb-trx', TOOLS.trxRaw, {
        records: [
          {
            snapshot_time: '2026-09-10 15:30:28',
            transactions: [
              {
                trx_id: '123',
                trx_state: 'LOCK WAIT',
                trx_started: '2026-09-10 15:20:00',
                trx_query: 'update t set v=1',
                server_extra_field: 'preserved',
              },
              { trx_id: '124', trx_state: 'RUNNING' },
            ],
          },
        ],
      }),
    ],
  })
  assert.match(html, /2026-09-10 15:30:28/)
  assert.match(html, /\*\*\*\*\* 1\.row \*\*\*\*\*/)
  assert.match(html, /\*\*\*\*\* 2\.row \*\*\*\*\*/)
  assert.match(html, /trx_state: LOCK WAIT/)
  assert.match(html, /server_extra_field: preserved/)
})

test('status raw sections and query_metrics render one chart per metric', () => {
  const records = [
    { timestamp: '2026-09-10 15:30:00', cpu_use_rate: 20, memory_use_rate: 40 },
    { timestamp: '2026-09-10 15:31:00', cpu_use_rate: 30, memory_use_rate: 45 },
  ]
  const html = buildReportFragment({
    items: [
      item('st1', 'status', TOOLS.status, {
        sections: [
          { section: 'system_resource_usage', records },
          {
            section: 'slave_issues',
            records: [
              { timestamp: '2026-09-10 15:30:00', slave_io_running: 'Yes' },
              { timestamp: '2026-09-10 15:31:00', slave_io_running: 'No' },
            ],
          },
        ],
      }),
      item('st2', 'status', TOOLS.metrics, {
        records: [
          { timestamp: '2026-09-10 15:30:00', threads_running: 2 },
          { timestamp: '2026-09-10 15:31:00', threads_running: 5 },
        ],
      }),
    ],
  })
  assert.match(html, /系统资源/)
  assert.match(html, /复制指标/)
  assert.match(html, /cpu_use_rate/)
  assert.match(html, /memory_use_rate/)
  assert.match(html, /slave_io_running/)
  assert.match(html, /threads_running/)
  assert.ok((html.match(/class="metric-card/g) || []).length >= 4)
  assert.doesNotMatch(html, /start_time|data_status/)
})

test('iostat separates throughput, await, and queue for every device', () => {
  const rows = [
    { timestamp: '2026-09-10 15:30:00', r_mbs: 1, w_mbs: 2, r_await: 3, w_await: 4, avgqu_sz: 5 },
    { timestamp: '2026-09-10 15:31:00', r_mbs: 2, w_mbs: 3, r_await: 4, w_await: 5, avgqu_sz: 6 },
  ]
  const html = buildReportFragment({
    items: [
      item('io1', 'iostat', TOOLS.iostat, {
        sections: [
          { section: 'nvme0n1', records: rows },
          { section: 'md0', records: rows },
        ],
      }),
    ],
  })
  assert.match(html, /nvme0n1/)
  assert.match(html, /md0/)
  assert.equal((html.match(/吞吐 \(MB\/s\)/g) || []).length, 2)
  assert.equal((html.match(/等待时延 \(ms\)/g) || []).length, 2)
  assert.equal((html.match(/平均队列长度/g) || []).length, 2)
})

test('iotop shows summary and process data, not transport wrappers', () => {
  const html = buildReportFragment({
    items: [
      item('iot1', 'iotop', TOOLS.iotop, {
        sections: [
          {
            section: 'summary',
            records: [{ timestamp: '2026-09-10 15:30:23', actual_disk_read: '10.5 M/s', actual_disk_write: '2.0 M/s' }],
          },
          {
            section: 'processes',
            records: [
              {
                timestamp: '2026-09-10 15:30:23',
                pid: 12,
                user: 'mysql',
                prio: 'be/4',
                disk_read: '8.0 M/s',
                disk_write: '1.0 M/s',
                swap_in: '0.0%',
                io_pct: '50.5%',
                command: 'mysqld',
              },
            ],
          },
        ],
      }),
    ],
  })
  assert.match(html, /actual_disk_read/)
  assert.match(html, /10\.5 M\/s/)
  assert.match(html, /IO Top Processes/)
  assert.match(html, /mysqld/)
})

test('host load renders all 19 raw fields in four unit-compatible groups', () => {
  const row = {
    timestamp: '2026-09-10 15:30:00',
    load_1min: 1,
    load_5min: 2,
    load_15min: 3,
    cpu_us: 4,
    cpu_sy: 5,
    cpu_ni: 0,
    cpu_id: 90,
    cpu_wa: 1,
    cpu_hi: 0,
    cpu_si: 0,
    cpu_st: 0,
    tasks_total: 100,
    tasks_running: 2,
    tasks_sleeping: 98,
    tasks_zombie: 0,
    mem_total: 1000,
    mem_free: 200,
    mem_used: 700,
    mem_cache: 100,
  }
  const html = buildReportFragment({
    items: [item('h1', 'host-load', TOOLS.hostLoad, { cpu_cores: 80, records: [row, { ...row, timestamp: '2026-09-10 15:31:00', cpu_us: 8 }] })],
  })
  assert.match(html, /CPU cores: 80/)
  assert.match(html, />Load</)
  assert.match(html, /CPU \(%\)/)
  assert.match(html, />Tasks</)
  assert.match(html, /Memory \(KiB\)/)
  for (const key of Object.keys(row).filter((key) => key !== 'timestamp')) assert.match(html, new RegExp(key))
})

test('pending, empty and errors are compact notices rather than raw status JSON', () => {
  const html = buildReportFragment({
    items: [
      item('e1', 'status', TOOLS.status, undefined, { state: 'pending' }),
      item('e2', 'status', TOOLS.status, undefined, { state: 'empty' }),
      item('e3', 'status', TOOLS.status, undefined, { state: 'error', error: 'timeout' }),
    ],
  })
  assert.match(html, /正在补拉原始数据/)
  assert.match(html, /该次调用返回为空/)
  assert.match(html, /原调用失败：timeout/)
  assert.doesNotMatch(html, /"status":|"start_time":/)
})

test('multiple successful calls stay as multiple entries and each has fullscreen', () => {
  const items = [
    item('m1', 'status', TOOLS.metrics, { records: [{ timestamp: 'x', qps: 1 }] }),
    item('m2', 'status', TOOLS.metrics, { records: [{ timestamp: 'x', qps: 2 }] }),
  ]
  const html = buildReportFragment({ items })
  assert.equal((html.match(/class="data-entry"/g) || []).length, 2)
  assert.equal((html.match(/data-zoom=/g) || []).length, 2)
  assert.match(html, /#1/)
  assert.match(html, /#2/)
  assert.equal(itemTitle(items[0]!), 'query_metrics')
})

test('scoped CSS is safe in the main document and keeps text selectable', () => {
  const css = reportCss()
  assert.doesNotMatch(css, /:root/)
  assert.doesNotMatch(css, /(^|\n|})\s*(html|body)\s*[,{]/)
  for (const line of css.split('\n')) {
    const text = line.trim()
    if (text) assert.ok(text.startsWith(`.${REPORT_SCOPE}`), `未加作用域: ${text.slice(0, 80)}`)
  }
  assert.match(css, /-webkit-user-drag:none/)
  assert.match(css, /user-select:text/)
  assert.match(css, /var\(--dsw-label\)/)
})

test('terminal keeps dark high-contrast text even when editor pre styles load later', () => {
  const reportStyle = document.createElement('style')
  reportStyle.textContent = reportCss()
  const editorStyle = document.createElement('style')
  // 真实 core-editor 规则的关键部分；故意后插入，验证不是靠加载顺序侥幸取胜。
  editorStyle.textContent =
    '.page-editor .tiptap pre{background:#f5f5f5;color:#1a1a1a;font:11px/1.4 monospace}'
  document.head.append(reportStyle, editorStyle)

  const root = document.createElement('div')
  root.className = 'page-editor'
  root.innerHTML =
    '<div class="tiptap"><div class="mcpi"><article class="data-entry"><div class="entry-body"><pre class="term processlist-term">ID,USER</pre></div></article></div></div>'
  document.body.append(root)
  const terminal = root.querySelector('.term') as HTMLElement
  const style = getComputedStyle(terminal)
  assert.equal(style.backgroundColor, 'rgb(23, 25, 31)')
  assert.equal(style.color, 'rgb(243, 245, 248)')
  // jsdom 对“后置 shorthand vs 前置 !important longhand”的字体级联实现不准确，
  // 这里直接守住声明；真实浏览器按规范由 !important longhand 获胜。
  assert.match(
    reportCss(),
    /\.entry-body \.term\{[^}]*font-size:13px!important[^}]*font-weight:500!important/,
  )

  root.remove()
  reportStyle.remove()
  editorStyle.remove()
})

test('stamping makes entries, charts, terminal and tables reachable by pick', () => {
  const raw = buildReportFragment({
    items: [
      item('p1', 'processlist', TOOLS.processRaw, {
        title: ['timestamp', ...['ID', 'USER', 'HOST', 'db', 'COMMAND', 'TIME', 'STATE', 'INFO']],
        snapshots: [{ timestamp: '2026-09-10 15:30:23', data: [['t', '1', 'u', 'h', 'd', 'Query', '1', 'run', 'sql']] }],
      }),
      item('st1', 'status', TOOLS.metrics, {
        records: [{ timestamp: '2026-09-10 15:30:00', qps: 1 }, { timestamp: '2026-09-10 15:31:00', qps: 2 }],
      }),
      item('iot1', 'iotop', TOOLS.iotop, {
        sections: [{ section: 'processes', records: [{ pid: 1, command: 'mysqld' }] }],
      }),
    ],
  })
  const html = stampReportHtml(raw, reportBlockKey('session-1', 1, raw))
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  const hits = [...wrap.querySelectorAll('[data-biu-kind][data-biu-id]')]
  assert.ok(hits.length > 10)
  assert.ok(hits.every((node) => node.getAttribute('data-biu-kind') === PICK_KIND))
  const ids = hits.map((node) => node.getAttribute('data-biu-id'))
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(wrap.querySelectorAll('article[data-biu-kind]').length, 3)
  assert.ok(wrap.querySelectorAll('svg[data-biu-kind]').length > 0)
  assert.ok(wrap.querySelectorAll('pre[data-biu-kind]').length > 0)
  assert.ok(wrap.querySelectorAll('table[data-biu-kind]').length > 0)
  assert.equal(wrap.querySelectorAll('tr[data-biu-kind],td[data-biu-kind]').length, 0)
  const zoom = wrap.querySelector('[data-zoom]')
  assert.ok(zoom?.hasAttribute('data-biu-ignore'))
  assert.equal(zoom?.hasAttribute('data-biu-kind'), false)
})

test('fullscreen copy drops nested fullscreen buttons but remains pickable', () => {
  const reportItem = item('m1', 'status', TOOLS.metrics, {
    records: [{ timestamp: '2026-09-10 15:30:00', qps: 1 }],
  })
  const html = stampReportHtml(buildReportFragment({ items: [reportItem], zoomable: false }), 'zoom')
  assert.doesNotMatch(html, /data-zoom/)
  assert.match(html, /data-biu-kind/)
})
