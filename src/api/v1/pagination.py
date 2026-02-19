"""Pagination utilities for API v1."""

from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    """Page number pagination with client-controlled page size."""

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 200
