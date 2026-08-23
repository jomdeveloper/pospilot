import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '../api';
import {
  DEFAULT_PRODUCT_FILTERS,
  PRODUCT_SEARCH_PAGE_SIZE,
  buildSearchQueryParams,
  resolveProductSearchRequest,
} from '../utils/productSearchFilters';

const DEBOUNCE_MS = 300;
const CACHE_MAX_ENTRIES = 50;

/** Simple LRU-style cache for search responses. */
const searchCache = new Map();

function cacheKey(params) {
  return JSON.stringify(params);
}

function getCached(key) {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > 60_000) {
    searchCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  if (searchCache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = searchCache.keys().next().value;
    searchCache.delete(firstKey);
  }
  searchCache.set(key, { at: Date.now(), data });
}

export function clearProductSearchCache() {
  searchCache.clear();
}

export function useProductSearch({ open, onSelectProduct }) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(DEFAULT_PRODUCT_FILTERS);
  const [products, setProducts] = useState([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterMeta, setFilterMeta] = useState({ categories: [], brands: [] });
  const [columns, setColumns] = useState(4);

  const searchInputRef = useRef(null);
  const gridRef = useRef(null);
  const cardRefs = useRef([]);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  const resetState = useCallback(() => {
    setQuery('');
    setFilters(DEFAULT_PRODUCT_FILTERS);
    setProducts([]);
    setHighlightIndex(0);
    setLoading(false);
    setError('');
    setPage(1);
    setTotalPages(1);
    setTotal(0);
  }, []);

  const fetchProducts = useCallback(async (searchQuery, searchFilters, searchPage, append = false) => {
    const { q: effectiveQuery, filters: effectiveFilters } = resolveProductSearchRequest({
      q: searchQuery,
      filters: searchFilters,
    });

    const params = buildSearchQueryParams({
      q: effectiveQuery,
      filters: effectiveFilters,
      page: searchPage,
      limit: PRODUCT_SEARCH_PAGE_SIZE,
    });

    const key = cacheKey({ ...params, append });
    const cached = getCached(key);
    if (cached) {
      setProducts((prev) => (append ? [...prev, ...cached.items] : cached.items));
      setTotal(cached.total);
      setTotalPages(cached.totalPages);
      setPage(cached.page);
      setHighlightIndex(append ? 0 : 0);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');

    try {
      const result = await api.searchProducts(params);
      if (requestId !== requestIdRef.current) return;

      setCache(key, result);
      setProducts((prev) => (append ? [...prev, ...result.items] : result.items));
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setPage(result.page);
      if (!append) setHighlightIndex(0);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err.message);
      if (!append) setProducts([]);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  // Load filter metadata when modal opens.
  useEffect(() => {
    if (!open) return;

    api.getProductFilterMeta()
      .then(setFilterMeta)
      .catch(() => setFilterMeta({ categories: [], brands: [] }));
  }, [open]);

  // Debounced search when query or filters change.
  useEffect(() => {
    if (!open) return undefined;

    clearProductSearchCache();

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      fetchProducts(query, filters, 1, false);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query, filters, fetchProducts]);

  // Focus search input when modal opens.
  useEffect(() => {
    if (!open) {
      resetState();
      return undefined;
    }

    const timer = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    return () => cancelAnimationFrame(timer);
  }, [open, resetState]);

  // Track grid column count for arrow-key navigation.
  useEffect(() => {
    if (!open || !gridRef.current) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width >= 1100) setColumns(4);
      else if (width >= 820) setColumns(3);
      else if (width >= 520) setColumns(2);
      else setColumns(1);
    });

    observer.observe(gridRef.current);
    return () => observer.disconnect();
  }, [open]);

  // Scroll highlighted card into view.
  useEffect(() => {
    const el = cardRefs.current[highlightIndex];
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightIndex, products.length]);

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_PRODUCT_FILTERS);
  }, []);

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((v) => v !== '' && v !== null && v !== undefined),
    [filters]
  );

  const selectProduct = useCallback(
    (product) => {
      if (!product) return;
      onSelectProduct(product);
    },
    [onSelectProduct]
  );

  const selectHighlighted = useCallback(() => {
    const product = products[highlightIndex];
    if (product) selectProduct(product);
  }, [products, highlightIndex, selectProduct]);

  const moveHighlight = useCallback(
    (direction) => {
      if (products.length === 0) return;

      setHighlightIndex((prev) => {
        const max = products.length - 1;
        let next = prev;

        switch (direction) {
          case 'up':
            next = Math.max(0, prev - columns);
            break;
          case 'down':
            next = Math.min(max, prev + columns);
            break;
          case 'left':
            next = Math.max(0, prev - 1);
            break;
          case 'right':
            next = Math.min(max, prev + 1);
            break;
          default:
            break;
        }

        return next;
      });
    },
    [products.length, columns]
  );

  const loadNextPage = useCallback(() => {
    if (page < totalPages && !loading) {
      fetchProducts(query, filters, page + 1, true);
    }
  }, [page, totalPages, loading, query, filters, fetchProducts]);

  const handleSearchKeyDown = useCallback(
    (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveHighlight('down');
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveHighlight('up');
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveHighlight('right');
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveHighlight('left');
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        selectHighlighted();
        return;
      }
    },
    [moveHighlight, selectHighlighted]
  );

  return {
    query,
    setQuery,
    filters,
    updateFilter,
    clearFilters,
    hasActiveFilters,
    products,
    highlightIndex,
    setHighlightIndex,
    loading,
    error,
    page,
    totalPages,
    total,
    filterMeta,
    searchInputRef,
    gridRef,
    cardRefs,
    handleSearchKeyDown,
    selectProduct,
    selectHighlighted,
    moveHighlight,
    loadNextPage,
  };
}
