"""
Professional PDF Report Generator for CPU Scheduling Simulations using ReportLab.
"""
from io import BytesIO
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .engine import ALGORITHMS, simulate


def _hex_to_rl(hex_color: str):
    try:
        return colors.HexColor(hex_color)
    except Exception:
        return colors.HexColor('#6c8cff')


def _build_gantt_drawing(gantt_data, color_map, width=490, height=62):
    d = Drawing(width, height)
    if not gantt_data:
        return d
    total = max(b['end'] for b in gantt_data) or 1
    pad_x = 8
    bar_w = width - 2 * pad_x
    bar_y = 22
    bar_h = 26

    for b in gantt_data:
        x = pad_x + (b['start'] / total) * bar_w
        w = max(2, ((b['end'] - b['start']) / total) * bar_w)
        fill = _hex_to_rl(color_map.get(b['pid'], '#6c8cff')) if b['pid'] else colors.HexColor('#cbd5e1')
        d.add(Rect(x, bar_y, w, bar_h, fillColor=fill, strokeColor=colors.white, strokeWidth=0.6))
        label = b['pid'] or 'IDLE'
        if w >= 16:
            d.add(String(x + w / 2, bar_y + 9, label, textAnchor='middle', fontSize=7.5, fillColor=colors.black))
        d.add(String(x, 10, str(b['start']), textAnchor='middle', fontSize=6.5, fillColor=colors.HexColor('#334155')))
    d.add(String(pad_x + bar_w, 10, str(total), textAnchor='end', fontSize=6.5, fillColor=colors.HexColor('#334155')))
    return d


def generate_simulation_pdf(sim) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f'CPU Scheduling Report - {sim.name}',
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('TitleCustom', parent=styles['Title'], fontSize=18, textColor=colors.HexColor('#1e293b'), spaceAfter=4)
    h2_style = ParagraphStyle('H2Custom', parent=styles['Heading2'], fontSize=12, textColor=colors.HexColor('#1e40af'), spaceBefore=10, spaceAfter=5)
    body_style = ParagraphStyle('BodyCustom', parent=styles['Normal'], fontSize=9.2, leading=13, textColor=colors.HexColor('#1e293b'))

    elements = []
    algo_name = ALGORITHMS.get(sim.algorithm, {}).get('name', sim.algorithm)

    # 1. Header
    elements.append(Paragraph('CPU Process Scheduling Simulator — Simulation Report', title_style))
    elements.append(Paragraph(f'<b>Report Title:</b> {sim.name}', body_style))
    elements.append(Spacer(1, 6))

    user_full = f'{sim.user.first_name} {sim.user.last_name}'.strip() or sim.user.username
    meta_table = Table([
        ['Student / User', f'{user_full} (@{sim.user.username})', 'Simulation Date', sim.created_at.strftime('%Y-%m-%d %H:%M UTC')],
        ['Email', sim.user.email, 'Algorithm', f'{algo_name} ({sim.algorithm})'],
        ['Time Quantum', str(sim.quantum), 'Priority Aging', f"{'Enabled' if sim.aging else 'Disabled'} (interval={sim.aging_interval})"],
        ['Starvation Threshold', f'{sim.starvation_threshold} units', 'Total Processes', str(sim.processes.count())],
    ], colWidths=[95, 160, 95, 160])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#eef2ff')),
        ('BACKGROUND', (2, 0), (2, -1), colors.HexColor('#eef2ff')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.2),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(meta_table)

    # 2. Process Input & Execution Table
    elements.append(Paragraph('1. Process Input &amp; Execution Metrics', h2_style))
    procs = list(sim.processes.all())
    proc_rows = [['PID', 'Arrival', 'Burst', 'Priority', 'I/O', 'Start', 'Completion', 'TAT', 'WT', 'RT', 'Starved']]
    color_map = {}
    for p in procs:
        color_map[p.pid] = p.color
        proc_rows.append([
            p.pid, str(p.arrival_time), str(p.burst_time), str(p.priority),
            f'{p.io_time}@{p.io_at}' if p.io_time else '—',
            str(p.start_time if p.start_time is not None else '—'),
            str(p.completion_time), str(p.turnaround_time), str(p.waiting_time),
            str(p.response_time), 'Yes' if p.starved else 'No',
        ])
    proc_table = Table(proc_rows, repeatRows=1)
    proc_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#cbd5e1')),
        ('PADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(proc_table)

    # 3. Gantt Chart
    elements.append(Paragraph('2. Gantt Chart Visualization', h2_style))
    elements.append(_build_gantt_drawing(sim.gantt_data, color_map))

    # 4. Execution Timeline
    elements.append(Paragraph('3. Process Execution Timeline', h2_style))
    timeline_str = ' → '.join(
        f"[{b['start']}–{b['end']}: {b['pid'] or 'IDLE'}]" for b in sim.gantt_data
    )
    elements.append(Paragraph(timeline_str, body_style))

    # 5. Performance Metrics
    elements.append(Paragraph('4. Overall Performance Metrics', h2_style))
    perf_table = Table([
        ['Avg Waiting Time', f'{sim.avg_wt:.2f}', 'Avg Turnaround Time', f'{sim.avg_tat:.2f}'],
        ['Avg Response Time', f'{sim.avg_rt:.2f}', 'CPU Utilization', f'{sim.cpu_util:.2f}%'],
        ['Throughput', f'{sim.throughput:.4f} proc/unit', 'Makespan', f'{sim.makespan} units'],
        ['Context Switches', str(sim.context_switches), 'Starved Processes', str(sim.starved_count)],
    ], colWidths=[115, 140, 115, 140])
    perf_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#ecfdf5')),
        ('BACKGROUND', (2, 0), (2, -1), colors.HexColor('#ecfdf5')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.2),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(perf_table)

    # 6. Multi-Algorithm Comparison on Identical Workload
    elements.append(Paragraph('5. Algorithm Comparison (Identical Process Workload)', h2_style))
    raw_procs = [
        {
            'pid': p.pid, 'arrival': p.arrival_time, 'burst': p.burst_time,
            'priority': p.priority, 'ioAt': p.io_at, 'ioTime': p.io_time, 'color': p.color,
        }
        for p in procs
    ]
    opts = sim.options_data or {'quantum': sim.quantum, 'aging': sim.aging, 'agingInterval': sim.aging_interval, 'starvationThreshold': sim.starvation_threshold}
    comp_rows = [['Algorithm', 'Avg WT', 'Avg TAT', 'Avg RT', 'CPU Util %', 'Throughput', 'Ctx Sw']]
    comp_results = []
    for algo_id, meta in ALGORITHMS.items():
        res = simulate(raw_procs, algo_id, opts)
        m = res['metrics']
        comp_results.append((meta['name'], m))
        comp_rows.append([
            meta['name'], f"{m['avgWT']:.2f}", f"{m['avgTAT']:.2f}", f"{m['avgRT']:.2f}",
            f"{m['cpuUtil']:.1f}%", f"{m['throughput']:.3f}", str(m['contextSwitches']),
        ])

    comp_table = Table(comp_rows, repeatRows=1)
    comp_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7.8),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#cbd5e1')),
        ('PADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(comp_table)

    # 7. Final Summary
    elements.append(Paragraph('6. Final Summary &amp; Recommendation', h2_style))
    best_wt = min(comp_results, key=lambda x: x[1]['avgWT'])
    best_rt = min(comp_results, key=lambda x: x[1]['avgRT'])
    fewest_cs = min(comp_results, key=lambda x: x[1]['contextSwitches'])
    summary_text = (
        f'For this {len(procs)}-process workload, <b>{best_wt[0]}</b> achieved the lowest average waiting time '
        f'({best_wt[1]["avgWT"]:.2f} units), <b>{best_rt[0]}</b> delivered the fastest average response time '
        f'({best_rt[1]["avgRT"]:.2f} units), and <b>{fewest_cs[0]}</b> incurred the fewest context switches '
        f'({fewest_cs[1]["contextSwitches"]}). The selected algorithm (<b>{algo_name}</b>) completed all processes '
        f'in {sim.makespan} units with {sim.cpu_util:.1f}% CPU utilization.'
    )
    elements.append(Paragraph(summary_text, body_style))

    doc.build(elements)
    return buf.getvalue()
