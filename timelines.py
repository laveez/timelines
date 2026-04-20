#!/usr/bin/env python3

from __future__ import annotations

import argparse
import colorsys
import csv
import html
import sys
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Iterable


DAY_WIDTH = 26
WEEK_WIDTH = 84
ROW_HEIGHT = 52
LABEL_WIDTH = 160
HEADER_HEIGHT = 112
PADDING = 24

BAR_COLORS = [
    "#e85d5d",
    "#e89a4d",
    "#d9c44a",
    "#b8d94a",
    "#7fd94a",
    "#38d98f",
    "#38cfe0",
    "#4d8fe8",
    "#7a4de8",
    "#b04de8",
]

DARK_BAR_COLORS = [
    "#c94a4a",
    "#c97f3d",
    "#b8a63c",
    "#97b83c",
    "#68b83c",
    "#2cb874",
    "#2cb0bf",
    "#3f78c9",
    "#623dc9",
    "#923dc9",
]

def rgb_to_hex(r: float, g: float, b: float) -> str:
    return "#{:02x}{:02x}{:02x}".format(round(r * 255), round(g * 255), round(b * 255))


def build_uniform_palette(count: int, lightness: float, saturation: float) -> list[str]:
    return [rgb_to_hex(*colorsys.hls_to_rgb(i / count, lightness, saturation)) for i in range(count)]


UNIFORM_BAR_COLORS = build_uniform_palette(10, lightness=0.5, saturation=0.55)

PALETTE_PRESETS = {
    "light": BAR_COLORS,
    "dark": DARK_BAR_COLORS,
    "uniform": UNIFORM_BAR_COLORS,
}

STATUS_CONFIRMED = "C"
STATUS_PLANNED = "P"

MONTH_NAMES = {
    1: "Jan",
    2: "Feb",
    3: "Mar",
    4: "Apr",
    5: "May",
    6: "Jun",
    7: "Jul",
    8: "Aug",
    9: "Sep",
    10: "Oct",
    11: "Nov",
    12: "Dec",
}


@dataclass(frozen=True)
class Period:
    status: str
    start: date
    end: date


@dataclass(frozen=True)
class Person:
    name: str
    periods: list[Period]


@dataclass(frozen=True)
class TimelineColumn:
    start: date
    end: date
    label: str
    background: str


def parse_date(raw_value: str) -> date:
    value = raw_value.strip()
    if not value:
        raise ValueError("Empty date value")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(
            f"Invalid date '{raw_value}'. Use ISO format 'YYYY-MM-DD'."
        ) from exc


def parse_csv(input_path: Path) -> list[Person]:
    people: list[Person] = []

    with input_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        for row_number, row in enumerate(reader, start=1):
            cells = [cell.strip() for cell in row]
            while cells and cells[-1] == "":
                cells.pop()
            if not cells:
                continue

            name = cells[0]
            period_cells = cells[1:]
            if len(period_cells) % 3 != 0:
                raise ValueError(
                    f"Row {row_number} for '{name}' must use status,start,end groups."
                )

            periods: list[Period] = []
            for index in range(0, len(period_cells), 3):
                group = index // 3 + 1
                raw_status = period_cells[index]
                raw_start = period_cells[index + 1]
                raw_end = period_cells[index + 2]
                if not raw_status and not raw_start and not raw_end:
                    continue
                if not (raw_status and raw_start and raw_end):
                    raise ValueError(
                        f"Row {row_number} for '{name}': period {group} is incomplete. "
                        "Fill status, start, and end, or clear all three."
                    )
                status = raw_status.upper()
                if status not in {STATUS_CONFIRMED, STATUS_PLANNED}:
                    raise ValueError(
                        f"Row {row_number} for '{name}' has invalid status '{raw_status}'. Use C or P."
                    )
                start = parse_date(raw_start)
                end = parse_date(raw_end)
                if end < start:
                    raise ValueError(
                        f"Row {row_number} for '{name}': end {end.isoformat()} is before start {start.isoformat()}."
                    )
                periods.append(Period(status=status, start=start, end=end))

            people.append(Person(name=name, periods=periods))

    if not people:
        raise ValueError("No timeline data found in input file.")

    return people


def daterange(start: date, end: date) -> Iterable[date]:
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def week_end(day: date) -> date:
    return week_start(day) + timedelta(days=6)


def build_timeline_bounds(
    people: list[Person],
    padding_days: int,
    from_date: date | None = None,
    to_date: date | None = None,
) -> tuple[date, date]:
    periods = [p for person in people for p in person.periods]
    if from_date is not None and to_date is not None:
        return from_date, to_date
    if not periods:
        raise ValueError(
            "No periods found; pass --from and --to to choose an explicit window."
        )
    earliest = min(p.start for p in periods)
    latest = max(p.end for p in periods)
    start = from_date if from_date is not None else earliest - timedelta(days=padding_days)
    end = to_date if to_date is not None else latest + timedelta(days=padding_days)
    return start, end


def period_in_window(period: Period, window_start: date, window_end: date) -> bool:
    return period.end >= window_start and period.start <= window_end


def resolve_palette(raw_palette: str | None) -> list[str]:
    if raw_palette is None:
        return DARK_BAR_COLORS

    preset = PALETTE_PRESETS.get(raw_palette.strip().lower())
    if preset is not None:
        return preset

    colors = [color.strip() for color in raw_palette.split(",") if color.strip()]
    if not colors:
        raise ValueError("Palette must contain at least one color.")
    return colors


def color_for_row(index: int, palette: list[str]) -> str:
    base_index = index % len(palette)
    cycle = index // len(palette)
    if cycle == 0:
        return palette[base_index]
    next_color = palette[(base_index + 1) % len(palette)]
    return interpolate_hls(palette[base_index], next_color, van_der_corput(cycle))


def period_fill(period: Period, color: str, row_index: int) -> str:
    if period.status == STATUS_PLANNED:
        return f"url(#planned-pattern-{row_index})"
    return color


def period_opacity(period: Period) -> str:
    if period.status == STATUS_PLANNED:
        return "0.92"
    return "1"


def hex_to_rgb(color: str) -> tuple[int, int, int] | None:
    value = color.strip()
    if not value.startswith("#"):
        return None

    hex_value = value[1:]
    if len(hex_value) == 3:
        hex_value = "".join(char * 2 for char in hex_value)
    if len(hex_value) != 6:
        return None

    try:
        return (
            int(hex_value[0:2], 16),
            int(hex_value[2:4], 16),
            int(hex_value[4:6], 16),
        )
    except ValueError:
        return None


def interpolate_hls(color_a: str, color_b: str, t: float) -> str:
    rgb_a = hex_to_rgb(color_a)
    rgb_b = hex_to_rgb(color_b)
    if rgb_a is None or rgb_b is None:
        return color_a
    h_a, l_a, s_a = colorsys.rgb_to_hls(*(channel / 255 for channel in rgb_a))
    h_b, l_b, s_b = colorsys.rgb_to_hls(*(channel / 255 for channel in rgb_b))
    hue_delta = (h_b - h_a) % 1.0
    if hue_delta > 0.5:
        hue_delta -= 1.0
    h = (h_a + hue_delta * t) % 1.0
    l = l_a + (l_b - l_a) * t
    s = s_a + (s_b - s_a) * t
    return rgb_to_hex(*colorsys.hls_to_rgb(h, l, s))


def van_der_corput(cycle: int) -> float:
    result = 0.0
    fraction = 0.5
    while cycle > 0:
        if cycle & 1:
            result += fraction
        fraction *= 0.5
        cycle >>= 1
    return result


def relative_luminance(color: str) -> float:
    rgb = hex_to_rgb(color)
    if rgb is None:
        return 0.0

    def normalize(channel: int) -> float:
        value = channel / 255
        if value <= 0.03928:
            return value / 12.92
        return ((value + 0.055) / 1.055) ** 2.4

    red, green, blue = (normalize(channel) for channel in rgb)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def contrast_ratio(color_a: str, color_b: str) -> float:
    l_a = relative_luminance(color_a)
    l_b = relative_luminance(color_b)
    lighter, darker = (l_a, l_b) if l_a >= l_b else (l_b, l_a)
    return (lighter + 0.05) / (darker + 0.05)


def format_period_label(period: Period) -> str:
    if period.start == period.end:
        return f"{period.start.day}.{period.start.month}."
    same_month = (
        period.start.year == period.end.year
        and period.start.month == period.end.month
    )
    if same_month:
        return f"{period.start.day}.-{period.end.day}.{period.end.month}."
    return f"{period.start.day}.{period.start.month}.-{period.end.day}.{period.end.month}."


# Approximate average glyph width at 12px sans-serif for the compact date labels we produce.
# A dedicated measurement step would need a DOM/canvas; this heuristic is tight enough for our
# labels (digits, dot, space, hyphen) to decide inside-vs-outside-bar placement.
_LABEL_AVG_CHAR_PX = 6.5


def estimate_label_width(label: str) -> float:
    return len(label) * _LABEL_AVG_CHAR_PX


def bar_text_color(color: str, period: Period, text_mode: str) -> str:
    white = "#ffffff"
    dark = "#0f172a"
    if text_mode == "fixed":
        return white if period.status == STATUS_CONFIRMED else dark
    if period.status == STATUS_PLANNED:
        return dark
    return white if contrast_ratio(color, white) >= contrast_ratio(color, dark) else dark


def month_segments(start: date, end: date) -> list[tuple[date, date]]:
    segments: list[tuple[date, date]] = []
    cursor = date(start.year, start.month, 1)
    while cursor <= end:
        if cursor.month == 12:
            next_month = date(cursor.year + 1, 1, 1)
        else:
            next_month = date(cursor.year, cursor.month + 1, 1)
        segment_start = max(start, cursor)
        segment_end = min(end, next_month - timedelta(days=1))
        if segment_start <= segment_end:
            segments.append((segment_start, segment_end))
        cursor = next_month
    return segments


def build_day_columns(timeline_start: date, timeline_end: date) -> list[TimelineColumn]:
    columns: list[TimelineColumn] = []
    for day in daterange(timeline_start, timeline_end):
        columns.append(
            TimelineColumn(
                start=day,
                end=day,
                label=str(day.day),
                background="#f1f5f9" if day.weekday() >= 5 else "#ffffff",
            )
        )
    return columns


def build_week_columns(timeline_start: date, timeline_end: date) -> list[TimelineColumn]:
    columns: list[TimelineColumn] = []
    cursor = week_start(timeline_start)
    end = week_end(timeline_end)
    while cursor <= end:
        iso_week = cursor.isocalendar().week
        columns.append(
            TimelineColumn(
                start=cursor,
                end=cursor + timedelta(days=6),
                label=f"W{iso_week:02d}",
                background="#ffffff" if len(columns) % 2 == 0 else "#f8fafc",
            )
        )
        cursor += timedelta(days=7)
    return columns


def build_columns(
    scale: str, timeline_start: date, timeline_end: date
) -> list[TimelineColumn]:
    if scale == "week":
        return build_week_columns(timeline_start, timeline_end)
    return build_day_columns(timeline_start, timeline_end)


def column_span(
    columns: list[TimelineColumn], range_start: date, range_end: date
) -> tuple[int, int]:
    first = next(index for index, column in enumerate(columns) if column.end >= range_start)
    last = max(index for index, column in enumerate(columns) if column.start <= range_end)
    return first, last


def week_bar_geometry(
    period: Period,
    columns: list[TimelineColumn],
    origin_x: int,
    column_width: int,
) -> tuple[float, float]:
    first_index, last_index = column_span(columns, period.start, period.end)
    first_column = columns[first_index]
    last_column = columns[last_index]
    start_fraction = max(0, (period.start - first_column.start).days) / 7
    end_fraction = min(7, (period.end - last_column.start).days + 1) / 7

    start_x = origin_x + LABEL_WIDTH + first_index * column_width + start_fraction * column_width
    end_x = origin_x + LABEL_WIDTH + last_index * column_width + end_fraction * column_width
    return start_x + 2, end_x - 2


def render_svg(
    people: list[Person],
    timeline_start: date,
    timeline_end: date,
    scale: str,
    title: str,
    subtitle: str,
    palette: list[str],
    text_mode: str,
) -> str:
    columns = build_columns(scale, timeline_start, timeline_end)
    column_width = WEEK_WIDTH if scale == "week" else DAY_WIDTH
    chart_width = LABEL_WIDTH + len(columns) * column_width
    chart_height = HEADER_HEIGHT + len(people) * ROW_HEIGHT + PADDING
    legend_color = palette[0]

    parts: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{chart_width + PADDING * 2}" '
        f'height="{chart_height + PADDING}" viewBox="0 0 {chart_width + PADDING * 2} {chart_height + PADDING}">',
        '<style>',
        'text { font-family: "Avenir Next", "Segoe UI", sans-serif; fill: #0f172a; }',
        ".small { font-size: 12px; }",
        ".label { font-size: 16px; font-weight: 600; }",
        ".month { font-size: 14px; font-weight: 700; }",
        ".title { font-size: 24px; font-weight: 700; }",
        "</style>",
        "<defs>",
    ]

    row_colors = [color_for_row(i, palette) for i in range(len(people))]

    for row_index, color in enumerate(row_colors):
        parts.extend(
            [
                (
                    f'<pattern id="planned-pattern-{row_index}" patternUnits="userSpaceOnUse" '
                    'width="10" height="10" patternTransform="rotate(45)">'
                ),
                f'<rect width="10" height="10" fill="{color}" fill-opacity="0.55" />',
                '<line x1="0" y1="0" x2="0" y2="10" stroke="#ffffff" stroke-width="3" stroke-opacity="0.72" />',
                "</pattern>",
            ]
        )

    parts.extend(
        [
        "</defs>",
        '<rect width="100%" height="100%" fill="#f8fafc" />',
        f'<text class="title" x="{PADDING}" y="34">{html.escape(title)}</text>',
        f'<text class="small" x="{PADDING}" y="52">{html.escape(subtitle)}</text>',
        f'<rect x="24" y="62" width="18" height="12" rx="4" fill="{legend_color}" />',
        '<text class="small" x="48" y="72">Confirmed</text>',
        '<rect x="132" y="62" width="18" height="12" rx="4" fill="url(#planned-pattern-0)" opacity="0.92" />',
        '<text class="small" x="156" y="72">Planned</text>',
        ]
    )

    origin_x = PADDING
    origin_y = 92

    visible_start = columns[0].start
    visible_end = columns[-1].end

    for segment_start, segment_end in month_segments(visible_start, visible_end):
        first_index, last_index = column_span(columns, segment_start, segment_end)
        x = origin_x + LABEL_WIDTH + first_index * column_width
        width = (last_index - first_index + 1) * column_width
        label = f"{MONTH_NAMES[segment_start.month]} {segment_start.year}"
        parts.append(
            f'<rect x="{x}" y="{origin_y}" width="{width}" height="26" fill="#e2e8f0" rx="6" />'
        )
        parts.append(
            f'<text class="month" x="{x + 8}" y="{origin_y + 17}">{html.escape(label)}</text>'
        )

    for index, column in enumerate(columns):
        x = origin_x + LABEL_WIDTH + index * column_width
        parts.append(
            f'<rect x="{x}" y="{origin_y + 30}" width="{column_width}" '
            f'height="{len(people) * ROW_HEIGHT + 8}" fill="{column.background}" stroke="#e2e8f0" />'
        )
        parts.append(
            f'<text class="small" x="{x + column_width / 2}" y="{origin_y + 48}" text-anchor="middle">{html.escape(column.label)}</text>'
        )

    for row_index, person in enumerate(people):
        row_top = origin_y + 56 + row_index * ROW_HEIGHT
        label_y = row_top + 21
        color = row_colors[row_index]

        parts.append(
            f'<text class="label" x="{origin_x}" y="{label_y}">{html.escape(person.name)}</text>'
        )
        parts.append(
            f'<line x1="{origin_x}" y1="{row_top + 34}" x2="{origin_x + chart_width}" '
            f'y2="{row_top + 34}" stroke="#cbd5e1" />'
        )

        sorted_periods = sorted(
            (p for p in person.periods if period_in_window(p, timeline_start, timeline_end)),
            key=lambda p: p.start,
        )
        period_geometries: list[tuple[float, float]] = []
        for period in sorted_periods:
            if scale == "week":
                x, end_x = week_bar_geometry(period, columns, origin_x, column_width)
            else:
                first_index, last_index = column_span(columns, period.start, period.end)
                x = origin_x + LABEL_WIDTH + first_index * column_width + 2
                end_x = x + (last_index - first_index + 1) * column_width - 4
            period_geometries.append((x, end_x))

        used_right_edge = origin_x + LABEL_WIDTH
        for index, period in enumerate(sorted_periods):
            x, end_x = period_geometries[index]
            width = end_x - x
            label = format_period_label(period)
            fill = period_fill(period, color, row_index)
            opacity = period_opacity(period)
            rect_attrs = (
                f'x="{x}" y="{row_top + 3}" width="{width}" height="24" '
                f'fill="{fill}" opacity="{opacity}" rx="10"'
            )
            if period.status == STATUS_PLANNED:
                rect_attrs += f' stroke="{color}" stroke-width="1"'
            parts.append(f'<rect {rect_attrs} />')
            label_width = estimate_label_width(label)
            inside_padding = 4
            outside_gap = 4
            next_bar_x = (
                period_geometries[index + 1][0]
                if index + 1 < len(period_geometries)
                else origin_x + chart_width
            )
            label_x: float | None
            label_fill = bar_text_color(color, period, text_mode)
            if width >= label_width + inside_padding * 2:
                label_x = x + inside_padding
                used_right_edge = end_x
            elif end_x + outside_gap + label_width + outside_gap <= next_bar_x:
                label_x = end_x + outside_gap
                label_fill = "#0f172a"
                used_right_edge = label_x + label_width
            elif x - outside_gap - label_width >= used_right_edge:
                label_x = x - outside_gap - label_width
                label_fill = "#0f172a"
                used_right_edge = end_x
            else:
                label_x = None
                used_right_edge = end_x
            if label_x is not None:
                parts.append(
                    f'<text class="small" x="{label_x}" y="{row_top + 19}" style="fill: {label_fill};">{html.escape(label)}</text>'
                )

    parts.append("</svg>")
    return "\n".join(parts)


def render_html(svg_content: str, page_title: str) -> str:
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{html.escape(page_title)}</title>
    <style>
      :root {{
        color-scheme: light;
      }}

      * {{
        box-sizing: border-box;
      }}

      body {{
        margin: 0;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(14, 165, 233, 0.16), transparent 28%),
          linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
        color: #0f172a;
      }}

      .page {{
        padding: 32px;
      }}

      .card {{
        overflow-x: auto;
        border: 1px solid rgba(148, 163, 184, 0.45);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
      }}

      svg {{
        display: block;
        min-width: 100%;
        height: auto;
      }}
    </style>
  </head>
  <body>
    <main class="page">
      <section class="card">
        {svg_content}
      </section>
    </main>
  </body>
</html>
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Render a timeline from a CSV file."
    )
    parser.add_argument("input", type=Path, help="Path to the CSV input file.")
    parser.add_argument(
        "--padding-days",
        type=int,
        default=2,
        help="Extra days to show before the first and after the last period.",
    )
    parser.add_argument(
        "--html-output",
        type=Path,
        default=None,
        help="Path for the generated HTML file. Defaults to timelines.html "
        "when rendering the bundled example, otherwise gitignored/<input-stem>.html.",
    )
    parser.add_argument(
        "--svg-output",
        type=Path,
        default=None,
        help="Path for the generated SVG file. Defaults to timelines.svg "
        "when rendering the bundled example, otherwise gitignored/<input-stem>.svg.",
    )
    parser.add_argument(
        "--scale",
        choices=("day", "week"),
        default="week",
        help="Timeline scale for the visualization.",
    )
    parser.add_argument(
        "--title",
        default="Timeline",
        help="Main title shown in the visualization header.",
    )
    parser.add_argument(
        "--subtitle",
        default=None,
        help="Secondary header text. Defaults to '<Scale> view'.",
    )
    parser.add_argument(
        "--palette",
        default=None,
        help="Palette preset like 'dark', 'light', or 'uniform', or a comma-separated list of colors.",
    )
    parser.add_argument(
        "--text-mode",
        choices=("auto", "fixed"),
        default="auto",
        help="Bar text color rule. 'auto' picks per-color WCAG contrast. "
        "'fixed' always uses white on confirmed bars and dark on planned bars.",
    )
    parser.add_argument(
        "--from",
        dest="from_date",
        type=date.fromisoformat,
        default=None,
        help="Clip the timeline to start at this YYYY-MM-DD date (inclusive).",
    )
    parser.add_argument(
        "--to",
        dest="to_date",
        type=date.fromisoformat,
        default=None,
        help="Clip the timeline to end at this YYYY-MM-DD date (inclusive).",
    )
    return parser


DEFAULT_INPUT = Path("timelines.csv")

EXAMPLE_ARGS = [
    str(DEFAULT_INPUT),
    "--scale", "week",
    "--title", "Timeline 2026",
    "--palette", "uniform",
    "--text-mode", "fixed",
]


def default_output_path(input_path: Path, extension: str) -> Path:
    if input_path == DEFAULT_INPUT:
        return Path(f"timelines.{extension}")
    return Path("gitignored") / f"{input_path.stem}.{extension}"


def print_example_summary() -> None:
    formatted = " ".join(f'"{a}"' if " " in a else a for a in EXAMPLE_ARGS)
    print("No arguments given. Running the built-in example:")
    print(f"  python3 timelines.py {formatted}")
    print()
    print("Customize by passing any of these flags:")
    print("  <input.csv>              CSV input path")
    print("  --scale day|week         Column granularity")
    print("  --title TEXT             Header title")
    print("  --subtitle TEXT          Header subtitle (defaults to '<Scale> view')")
    print("  --palette NAME|LIST      dark | light | uniform | comma-separated colors")
    print("  --text-mode auto|fixed   Bar text color rule")
    print("  --padding-days N         Extra days on each side of the timeline")
    print("  --from YYYY-MM-DD        Clip the timeline to start at this date")
    print("  --to YYYY-MM-DD          Clip the timeline to end at this date")
    print("  --html-output PATH       Custom HTML output path (default: gitignored/<stem>.html for custom input)")
    print("  --svg-output PATH        Custom SVG output path (default: gitignored/<stem>.svg for custom input)")
    print("Run with --help for the full list.")
    print()


def main() -> int:
    parser = build_parser()
    if len(sys.argv) == 1:
        print_example_summary()
        args = parser.parse_args(EXAMPLE_ARGS)
    else:
        args = parser.parse_args()
    if args.html_output is None:
        args.html_output = default_output_path(args.input, "html")
    if args.svg_output is None:
        args.svg_output = default_output_path(args.input, "svg")
    people = parse_csv(args.input)
    timeline_start, timeline_end = build_timeline_bounds(
        people, args.padding_days, args.from_date, args.to_date
    )
    subtitle = args.subtitle or f"{args.scale.title()} view"
    palette = resolve_palette(args.palette)
    svg_content = render_svg(
        people,
        timeline_start,
        timeline_end,
        args.scale,
        args.title,
        subtitle,
        palette,
        args.text_mode,
    )
    html_content = render_html(svg_content, args.title)

    args.svg_output.parent.mkdir(parents=True, exist_ok=True)
    args.html_output.parent.mkdir(parents=True, exist_ok=True)
    args.svg_output.write_text(svg_content, encoding="utf-8")
    args.html_output.write_text(html_content, encoding="utf-8")

    print(f"Wrote SVG: {args.svg_output}")
    print(f"Wrote HTML: {args.html_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
