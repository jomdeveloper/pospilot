import {
  Search,
  X,
  Package,
  Barcode,
  CalendarClock,
  Loader2,
  Filter,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
} from 'lucide-react';
import { useProductSearch } from '../hooks/useProductSearch';
import {
  STOCK_STATUS_OPTIONS,
  buildExpirationOptions,
  formatPrice,
  getStockStatus,
} from '../utils/productSearchFilters';
import './ProductSearchModal.css';

function ProductCard({ product, highlighted, onMouseEnter, onClick, cardRef }) {
  const stock = getStockStatus(product.stock);
  const brand = product.brand || product.generic;

  return (
    <article
      ref={cardRef}
      className={`product-search-card ${highlighted ? 'product-search-card--highlighted' : ''}`}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      role="option"
      aria-selected={highlighted}
      tabIndex={-1}
    >
      <div className="product-search-card__image-wrap">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt=""
            className="product-search-card__image"
          />
        ) : (
          <div className="product-search-card__image-placeholder" aria-hidden="true">
            <Package size={28} strokeWidth={1.6} />
          </div>
        )}
      </div>

      <div className="product-search-card__body">
        <h3 className="product-search-card__name">{product.name}</h3>
        {brand && <p className="product-search-card__brand">{brand}</p>}

        <div className="product-search-card__meta">
          <span className="product-search-card__meta-item">
            <Barcode size={12} />
            {product.barcode || '—'}
          </span>
          {product.sku && product.sku !== product.barcode && (
            <span className="product-search-card__meta-item">SKU: {product.sku}</span>
          )}
        </div>

        <div className="product-search-card__footer">
          <div className="product-search-card__price">₱{formatPrice(product.price)}</div>
          <div className="product-search-card__details">
            <span className="product-search-card__category">{product.category || 'General'}</span>
            <span className={`product-search-card__stock product-search-card__stock--${stock.tone}`}>
              {product.stock} · {stock.label}
            </span>
          </div>
          {product.exp && (
            <div className="product-search-card__exp">
              <CalendarClock size={12} />
              Exp: {product.exp}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ProductSearchModal({ open, onClose, onSelectProduct }) {
  const expirationOptions = buildExpirationOptions();

  const {
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
    loadNextPage,
  } = useProductSearch({ open, onSelectProduct: (product) => {
    onSelectProduct(product);
    onClose();
  } });

  if (!open) return null;

  const handleOverlayKeyDown = (event) => {
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault();
      onClose();
    }
  };

  const handleGridScroll = (event) => {
    const el = event.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) loadNextPage();
  };

  return (
    <div
      className="product-search-overlay"
      onKeyDown={handleOverlayKeyDown}
      role="presentation"
    >
      <div
        className="product-search-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-search-title"
      >
        <header className="product-search-modal__header">
          <div className="product-search-modal__heading">
            <Search size={20} strokeWidth={2.2} />
            <h2 id="product-search-title">Search Product</h2>
          </div>
          <button
            type="button"
            className="product-search-modal__close"
            onClick={onClose}
            aria-label="Close search"
          >
            <X size={18} />
          </button>
        </header>

        <div className="product-search-modal__search">
          <div className="product-search-modal__search-icon">
            <Search size={22} strokeWidth={1.8} />
          </div>
          <input
            ref={searchInputRef}
            className="product-search-modal__search-input"
            type="search"
            placeholder="Search by product name, barcode, or SKU…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            aria-label="Search products"
            aria-controls="product-search-results"
            aria-activedescendant={
              products[highlightIndex] ? `product-search-item-${products[highlightIndex].id}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="product-search-modal__filters" role="group" aria-label="Product filters">
          <div className="product-search-modal__filters-label">
            <Filter size={14} />
            Filters
          </div>

          <label className="product-search-filter">
            <span className="product-search-filter__label">Category</span>
            <select
              value={filters.category}
              onChange={(e) => updateFilter('category', e.target.value)}
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {filterMeta.categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </label>

          <label className="product-search-filter">
            <span className="product-search-filter__label">Brand</span>
            <select
              value={filters.brand}
              onChange={(e) => updateFilter('brand', e.target.value)}
              aria-label="Filter by brand"
            >
              <option value="">All brands</option>
              {filterMeta.brands.map((brand) => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </label>

          <label className="product-search-filter product-search-filter--price">
            <span className="product-search-filter__label">Min price</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={filters.minPrice}
              onChange={(e) => updateFilter('minPrice', e.target.value)}
              aria-label="Minimum price"
            />
          </label>

          <label className="product-search-filter product-search-filter--price">
            <span className="product-search-filter__label">Max price</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Any"
              value={filters.maxPrice}
              onChange={(e) => updateFilter('maxPrice', e.target.value)}
              aria-label="Maximum price"
            />
          </label>

          <label className="product-search-filter">
            <span className="product-search-filter__label">Expiration</span>
            <select
              value={filters.expBefore}
              onChange={(e) => updateFilter('expBefore', e.target.value)}
              aria-label="Filter by expiration date"
            >
              {expirationOptions.map((opt) => (
                <option key={opt.value || 'any'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="product-search-filter">
            <span className="product-search-filter__label">Stock</span>
            <select
              value={filters.stockStatus}
              onChange={(e) => updateFilter('stockStatus', e.target.value)}
              aria-label="Filter by stock status"
            >
              {STOCK_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          {hasActiveFilters && (
            <button type="button" className="product-search-filter__clear" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>

        <div className="product-search-modal__status-bar">
          <span>
            {loading && products.length === 0 ? 'Searching…' : `${total} product${total === 1 ? '' : 's'} found`}
          </span>
          {totalPages > 1 && (
            <span className="product-search-modal__pagination-info">
              Page {page} of {totalPages}
            </span>
          )}
        </div>

        <div
          id="product-search-results"
          className="product-search-modal__results"
          ref={gridRef}
          onScroll={handleGridScroll}
          role="listbox"
          aria-label="Product search results"
        >
          {loading && products.length === 0 && (
            <div className="product-search-modal__state" role="status">
              <Loader2 size={32} className="product-search-modal__spinner" />
              <p>Loading products…</p>
            </div>
          )}

          {!loading && error && (
            <div className="product-search-modal__state product-search-modal__state--error" role="alert">
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && products.length === 0 && (
            <div className="product-search-modal__state" role="status">
              <Package size={40} strokeWidth={1.4} />
              <p>{query.trim() ? 'No products match your search' : 'No products match your filters'}</p>
              <span>
                {query.trim()
                  ? 'Try different keywords'
                  : 'Try adjusting filters or clear them to browse in-stock items'}
              </span>
            </div>
          )}

          {products.length > 0 && (
            <div className="product-search-grid">
              {products.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  highlighted={index === highlightIndex}
                  cardRef={(el) => { cardRefs.current[index] = el; }}
                  onMouseEnter={() => setHighlightIndex(index)}
                  onClick={() => selectProduct(product)}
                />
              ))}
            </div>
          )}

          {loading && products.length > 0 && (
            <div className="product-search-modal__loading-more" role="status">
              <Loader2 size={18} className="product-search-modal__spinner" />
              Loading more…
            </div>
          )}
        </div>

        <footer className="product-search-modal__footer">
          <div className="product-search-modal__hints">
            <span><kbd>↑↓←→</kbd> Navigate</span>
            <span><kbd>Enter</kbd> Select</span>
            <span><kbd>Tab</kbd> Filters</span>
            <span><kbd>Esc</kbd> Close</span>
          </div>
          <div className="product-search-modal__footer-actions">
            {page > 1 && (
              <span className="product-search-modal__page-nav">
                <ChevronLeft size={14} /> Scroll up for previous pages
              </span>
            )}
            {page < totalPages && (
              <span className="product-search-modal__page-nav">
                Scroll down for more <ChevronRight size={14} />
              </span>
            )}
            <button type="button" className="btn btn--outline-blue" onClick={onClose}>
              Cancel (Esc)
            </button>
            <button
              type="button"
              className="btn btn--blue"
              onClick={() => products[highlightIndex] && selectProduct(products[highlightIndex])}
              disabled={!products[highlightIndex]}
            >
              <ShoppingCart size={16} />
              Add to Cart (Enter)
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
