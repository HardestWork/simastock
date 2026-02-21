"""CSV export utilities."""
import csv
import io
from django.http import HttpResponse


def queryset_to_csv_response(queryset, columns, filename):
    """Convert a queryset to a CSV HttpResponse.

    Args:
        queryset: Django QuerySet
        columns: list of (field_name_or_callable, header_label) tuples.
            If field_name_or_callable is a string, getattr(obj, field) is used.
            If it's callable, it's called with the object.
        filename: download filename (without extension)
    """
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}.csv"'
    # UTF-8 BOM for Excel compatibility
    response.write("\ufeff")

    writer = csv.writer(response)
    writer.writerow([col[1] for col in columns])

    for obj in queryset.iterator():
        row = []
        for field, _ in columns:
            if callable(field):
                row.append(field(obj))
            else:
                val = getattr(obj, field, "")
                row.append(str(val) if val is not None else "")
        writer.writerow(row)

    return response
