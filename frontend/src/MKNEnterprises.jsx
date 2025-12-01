import React, { useState, useEffect } from 'react';
import logo from './logo.jpg';
import banner from './banner.jpeg';
import { 
  ShoppingCart, 
  Search, 
  X, 
  Plus, 
  Minus, 
  CheckCircle, 
  Copy, 
  Upload, 
  ArrowLeft, 
  Package, 
  CreditCard, 
  User,
  ClipboardList,
  Edit,
  Trash2,
  List,
  Loader2
} from 'lucide-react';

// Read he ackend API URL from Vite env. Set `VITE_API_URL` to e.g. "https://mkn-enterprices-bk.vercel.app/api"
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Client-side helper to compute delivery charge using the same tier logic as the backend
function computeDeliveryChargeClient(totalAmount, tiers = [], defaultCharge = 0) {
  const total = parseFloat(totalAmount || 0);
  if (!Array.isArray(tiers) || tiers.length === 0) return parseFloat(defaultCharge || 0);
  for (const t of tiers) {
    const min = parseFloat(t.min_amount || 0);
    const max = t.max_amount === null || t.max_amount === undefined ? null : parseFloat(t.max_amount);
    if ((total >= min) && (max === null || total <= max)) return parseFloat(t.charge || 0);
  }
  return parseFloat(defaultCharge || 0);
}

// --- Global Functions ---
// Utility for making authenticated fetch requests
const authenticatedFetch = async (endpoint, options = {}) => {
    const response = await fetch(`${API_URL}/${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown server error' }));
        throw new Error(errorData.error || response.statusText);
    }
    
    // Check if the response has content before parsing JSON
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return response.json();
    }
    return response.text(); // Return text if no JSON (e.g., successful delete)
};

// --- Components ---

const Header = ({ cartCount, onCartClick, onHomeClick, onSearch }) => (
  <header className="bg-blue-900 text-white sticky top-0 z-50 shadow-md">
    <div className="container mx-auto px-4 h-16 flex items-center justify-between">
      <div className="flex items-center gap-2 cursor-pointer" onClick={onHomeClick}>
        <img src={logo} alt="MKN" className="w-8 h-8 rounded-full object-cover" />
        <h1 className="font-bold text-lg md:text-xl tracking-tight">MKN Enterprises</h1>
      </div>
      
      <div className="relative">
        <button onClick={onCartClick} className="p-2 hover:bg-blue-800 rounded-full transition relative">
          <ShoppingCart size={24} />
          {cartCount > 0 && (
            <span className="absolute top-0 right-0 bg-orange-500 text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </div>
    
    <div className="bg-blue-800 p-3 md:hidden">
      <div className="relative w-full">
        <Search className="absolute left-3 top-2.5 text-blue-300" size={18} />
        <input 
          type="text" 
          placeholder="Search for products..." 
          className="w-full bg-blue-900 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-blue-300 text-sm"
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
    </div>
  </header>
);

const BannerSlider = () => {
  const BANNERS = [
    banner
  ];
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % BANNERS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-full h-48 md:h-72 overflow-hidden bg-gray-200">
      {BANNERS.map((src, index) => (
        <div 
          key={index}
          className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${index === current ? 'opacity-100' : 'opacity-0'}`}
        >
          <img src={src} alt="Banner" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
            <h2 className="text-white text-xl md:text-3xl font-bold drop-shadow-lg">Quality Wholesale Products</h2>
          </div>
        </div>
      ))}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {BANNERS.map((_, i) => (
          <div key={i} className={`w-2 h-2 rounded-full ${i === current ? 'bg-orange-500' : 'bg-white/50'}`} />
        ))}
      </div>
    </div>
  );
};

const ProductCard = ({ product, onClick }) => (
  <div 
    className="bg-white rounded-xl shadow-sm hover:shadow-md transition cursor-pointer border border-gray-100 overflow-hidden flex flex-col group"
    onClick={() => onClick(product)}
  >
    <div className="relative aspect-square overflow-hidden bg-gray-100">
      <img 
        src={product.image || `https://placehold.co/400x400/1e3a8a/ffffff?text=${product.name.substring(0, 1)}`} 
        alt={product.name} 
        className="w-full h-full object-cover group-hover:scale-105 transition duration-300" 
      />
      <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur px-2 py-1 rounded text-xs font-semibold text-gray-700">
        {product.category || 'N/A'}
      </div>
    </div>
    <div className="p-4 flex flex-col flex-grow">
      <h3 className="font-semibold text-gray-800 line-clamp-1 mb-1">{product.name}</h3>
      <div className="mt-auto flex items-end justify-between">
        <div>
          <p className="text-xs text-gray-500">Per {product.unit}</p>
          <p className="text-lg font-bold text-blue-900">₹{product.price}</p>
        </div>
        <button className="bg-orange-100 text-orange-600 p-2 rounded-lg hover:bg-orange-200 transition">
          <Plus size={18} />
        </button>
      </div>
    </div>
  </div>
);

// --- CHECKOUT COMPONENT ---
  const CheckoutPage = ({ items, total, onPlaceOrder, onBack, deliveryCharge, deliveryConfig = { tiers: [], default_charge: 0 } }) => {
  const [form, setForm] = useState({ name: '', address: '', upi: '', screenshot: null, mobileNumber: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePlaceOrderSubmit = async (e) => {
      e.preventDefault();
      setIsSubmitting(true);
      try {
        // If a screenshot File is present, convert it to a Base64 data URL before sending
        const payload = { ...form };
        if (payload.screenshot && payload.screenshot instanceof File) {
          const toDataURL = (file) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          try {
            payload.screenshot = await toDataURL(payload.screenshot);
          } catch (err) {
            console.error('Failed to read screenshot file:', err);
            payload.screenshot = null;
          }
        }

        await onPlaceOrder(payload);
      } catch (error) {
          console.error('Error during checkout:', error);
          alert(`Order placement failed: ${error.message}`);
      } finally {
          setIsSubmitting(false);
      }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-lg">
      <div className="flex items-center mb-6">
        <button onClick={onBack} className="mr-4">
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-2xl font-bold">Checkout</h2>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border mb-6">
        <h3 className="font-semibold mb-4 text-gray-700">Order Summary</h3>
        <div className="space-y-2 mb-4 max-h-40 overflow-y-auto">
          {items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm">
              <span>{item.name} x {item.quantity}</span>
              <span className="font-medium">₹{item.price * item.quantity}</span>
            </div>
          ))}
        </div>
        <div className="border-t pt-3 flex flex-col gap-2 text-lg text-blue-900">
          <div className="flex justify-between font-medium">
            <span>Subtotal</span>
            <span>₹{total}</span>
          </div>
          <div className="flex flex-col">
            <div className="flex justify-between font-medium">
              <span>Delivery Charge</span>
              <span>{parseFloat(deliveryCharge || 0) === 0 ? 'Free' : `₹${parseFloat(deliveryCharge).toFixed(2)}`}</span>
            </div>
            {/* Show threshold hint if configured: find the lowest min_amount for free tiers */}
            {(() => {
              // If admin provided  note, show it; otherwise, fall back to the computed free-delivery hint
              if (deliveryConfig && deliveryConfig.note && String(deliveryConfig.note).trim().length > 0) {
                return <div className="text-sm text-gray-500 mt-1">{deliveryConfig.note}</div>;
              }
              const tiers = deliveryConfig && Array.isArray(deliveryConfig.tiers) ? deliveryConfig.tiers : [];
              const zeroTiers = tiers.filter(t => parseFloat(t.charge || 0) === 0);
              if (zeroTiers.length > 0) {
                const mins = zeroTiers.map(t => parseFloat(t.min_amount || 0));
                const threshold = Math.min(...mins);
                if (!isNaN(threshold) && threshold > 0) {
                  return <div className="text-sm text-gray-500 mt-1">Order for more than ₹{threshold.toFixed(2)} to avail free delivery</div>;
                }
              }
              return null;
            })()}
          </div>
          <div className="flex justify-between font-bold text-xl">
            <span>Total Payable</span>
            <span>₹{(parseFloat(total || 0) + parseFloat(deliveryCharge || 0)).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <form className="space-y-4" onSubmit={handlePlaceOrderSubmit}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input 
            required
            type="text" 
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
            value={form.name}
            onChange={e => setForm({...form, name: e.target.value})}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
          <input 
            required
            type="tel" 
            pattern="[0-9]{10}"
            title="Mobile number must be 10 digits"
            maxLength="10"
            placeholder="10 digit number"
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
            value={form.mobileNumber}
            onChange={e => setForm({...form, mobileNumber: e.target.value.replace(/[^0-9]/g, '')})}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Address</label>
          <textarea 
            required
            rows="3"
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
            value={form.address}
            onChange={e => setForm({...form, address: e.target.value})}
          ></textarea>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h4 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
            <CreditCard size={18} /> Payment Details
          </h4>
          <p className="text-sm text-gray-600 mb-2">Please pay <strong>₹{total}</strong> to the UPI ID below:</p>
          <div className="bg-white p-3 rounded border border-dashed border-blue-300 text-center font-mono text-lg font-bold text-blue-800 mb-4 select-all">
            fatimanasar71-2@okaxis
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Your UPI ID</label>
            <input 
              required
              type="text" 
              placeholder="e.g. user@okicici"
              className="w-full p-2 border rounded bg-white"
              value={form.upi}
              onChange={e => setForm({...form, upi: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Upload Payment Screenshot</label>
            <div className="relative border rounded bg-white p-2 flex items-center gap-2">
              <Upload size={18} className="text-gray-400" />
              <input 
                type="file" 
                accept="image/*"
                className="text-sm text-gray-500 file:mr-4 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                onChange={e => setForm({...form, screenshot: e.target.files[0]})}
              />
            </div>
          </div>
        </div>

        <button 
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-green-600 text-white py-4 rounded-xl font-bold hover:bg-green-700 transition shadow-lg flex items-center justify-center gap-2 disabled:bg-gray-400"
        >
          {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />} 
          {isSubmitting ? 'Processing...' : 'Confirm Order'}
        </button>
      </form>
    </div>
  );
};
// --- END CHECKOUT COMPONENT ---

// --- ADMIN LOGIN COMPONENT ---
const AdminLoginPage = ({ onLogin, error }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(username, password);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-2xl">
        <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Admin Login</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Username</label>
            <input
              type="text"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm text-center font-medium">{error}</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            Log In
          </button>
          <p className="text-center text-xs text-gray-500">
             (Hint: admin / mknstore)
          </p>
        </form>
      </div>
    </div>
  );
};
// --- END ADMIN LOGIN COMPONENT ---


// --- ADMIN PRODUCT FORM COMPONENT ---
const ProductForm = ({ isEditing, productToEdit, handleUpdateProduct, handleAddProduct, setProductManagementView }) => {
    // Note: form.image holds the Base64 image data or URL
    const initial = isEditing ? productToEdit : { name: '', price: 0, unit: 'kg', category: '', image: '', quantity: 1 };
    const [form, setForm] = useState(initial);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                // Store the Base64 Data URL
                setForm(p => ({ ...p, image: reader.result })); 
            };
            // Read the file as a Data URL (Base64 string)
            reader.readAsDataURL(file);
        }
    };

    const handleFormSubmit = async (e) => {
      e.preventDefault();
      setIsSubmitting(true);
      
      try {
        if (!isEditing && !form.image) {
          throw new Error('Please upload a product image.');
        }

        const productData = {
          ...form,
          price: parseFloat(form.price) || 0,
          quantity: parseInt(form.quantity) || 1
        };

        if (isEditing) {
          await handleUpdateProduct(productData);
        } else {
          await handleAddProduct(productData);
        }
      } catch (error) {
          alert(`Action failed: ${error.message}`);
      } finally {
          setIsSubmitting(false);
      }
    };

    return (
      <div className="bg-white p-6 rounded-xl shadow mt-4 max-w-lg mx-auto">
        <h3 className="text-xl font-bold mb-4">{isEditing ? 'Edit Product' : 'Add New Product'}</h3>
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <input type="hidden" value={form.id} />
          
          <label className="block">
            <span className="text-gray-700">Product Name</span>
            <input required type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="mt-1 w-full p-2 border rounded-md" />
          </label>
          
          {/* Image Upload Field */}
          <label className="block">
            <span className="text-gray-700">Product Image</span>
            
            {/* Image Preview */}
            {form.image && (
                <div className="mt-2 mb-3 border border-gray-300 rounded-md p-2 bg-gray-50 flex justify-center">
                    <img src={form.image} alt="Preview" className="w-24 h-24 object-cover rounded shadow-md" />
                </div>
            )}

            {/* File Input */}
            <div className="relative border rounded-md p-3 bg-white flex items-center gap-2 hover:border-blue-500 transition">
                <Upload size={18} className="text-gray-400" />
                <input 
                    type="file" 
                    accept="image/*"
                    className="text-sm text-gray-500 file:mr-4 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    onChange={handleImageUpload}
                    required={!isEditing && !form.image} 
                />
            </div>
            <p className="text-xs text-gray-500 mt-1">Upload a JPEG, PNG, or GIF image (stored as Base64 in the database).</p>
          </label>
          {/* End Image Upload Field */}


          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-gray-700">Price (₹)</span>
              <input required type="number" step="0.01" min="0" value={form.price} onChange={e => setForm({...form, price: e.target.value})} className="mt-1 w-full p-2 border rounded-md" />
            </label>
            <label className="block">
              <span className="text-gray-700">Initial Quantity / Stock</span>
              <input required type="number" min="1" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} className="mt-1 w-full p-2 border rounded-md" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-gray-700">Unit (e.g., kg, liter)</span>
              <input required type="text" value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} className="mt-1 w-full p-2 border rounded-md" />
            </label>
            <label className="block">
              <span className="text-gray-700">Category</span>
              <input required type="text" value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="mt-1 w-full p-2 border rounded-md" />
            </label>
          </div>

          <div className="flex justify-between gap-4 pt-2">
            <button
              type="button"
              onClick={() => setProductManagementView('list')}
              className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-semibold flex items-center justify-center gap-2 disabled:bg-gray-400"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : (isEditing ? 'Save Changes' : 'Create Product')}
            </button>
          </div>
        </form>
      </div>
    );
};
// --- END ADMIN PRODUCT FORM COMPONENT ---


// --- Main App ---

export default function App() {
  // State
  const [view, setView] = useState('home'); // home, product, cart, checkout, success, admin
  const [products, setProducts] = useState([]); 
  const [cart, setCart] = useState([]); // Cart remains local for non-logged-in user session
  const [deliveryConfig, setDeliveryConfig] = useState({ tiers: [], default_charge: 0 });
  const [lastDeliveryCharge, setLastDeliveryCharge] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [orders, setOrders] = useState([]);
  const [checkoutSource, setCheckoutSource] = useState('cart'); // 'cart' or 'direct'
  const [directItem, setDirectItem] = useState(null);
  const [lastOrderId, setLastOrderId] = useState('');
  const [copyStatus, setCopyStatus] = useState(null); 
  const [dataLoading, setDataLoading] = useState(true); // Initial data loading state
  
  // Admin State
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false); 
  const [adminLoginError, setAdminLoginError] = useState('');
  const [adminAuthB64, setAdminAuthB64] = useState(null);
  const [adminTab, setAdminTab] = useState('orders'); // orders, products
  const [orderFilter, setOrderFilter] = useState('new'); // new, paid, processed
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [productManagementView, setProductManagementView] = useState('list'); // list, add, edit
  const [productToEdit, setProductToEdit] = useState(null);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [adminDeliveryConfig, setAdminDeliveryConfig] = useState({ tiers: [], default_charge: 0, note: '' });


  // --- API Handlers ---

  const fetchDeliveryConfig = async () => {
    try {
      const resp = await fetch(`${API_URL.replace(/\/api\/?$/, '')}/api/delivery`);
      if (!resp.ok) return;
      const cfg = await resp.json().catch(() => null);
      if (cfg) {
        cfg.tiers = cfg.tiers || [];
        cfg.default_charge = typeof cfg.default_charge !== 'undefined' ? cfg.default_charge : 0;
        cfg.note = cfg.note || '';
        setDeliveryConfig(cfg);
      }
    } catch (err) {
      console.warn('Could not fetch delivery config:', err);
    }
  };


  const fetchProducts = async () => {
    try {
      setDataLoading(true);
      const data = await authenticatedFetch('products');
      setProducts(data);
    } catch (error) {
      console.error("Error fetching products:", error);
      // Added more explicit instruction in the alert message
      alert(`Failed to load products from database. Please ensure the Express server is running on ${API_URL.replace('/api', '')} and connected to MySQL.`);
    } finally {
      setDataLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      const data = await authenticatedFetch('orders');
      setOrders(data);
    } catch (error) {
      console.error("Error fetching orders:", error);
      // Only show alert if in admin view, otherwise silent fail is fine.
      if (isAdminLoggedIn) {
        alert('Failed to load orders from database.');
      }
    }
  };

  const handleUpdateProduct = async (updatedProduct) => {
    await authenticatedFetch(`products/${updatedProduct.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: updatedProduct.name,
        price: updatedProduct.price,
        unit: updatedProduct.unit,
        category: updatedProduct.category,
        image: updatedProduct.image, // Base64 data
        quantity: updatedProduct.quantity,
      }),
    });
    setProductManagementView('list');
    await fetchProducts(); // Refresh list
  };

  const handleAddProduct = async (newProduct) => {
    await authenticatedFetch('products', {
      method: 'POST',
      body: JSON.stringify({
        name: newProduct.name,
        price: newProduct.price,
        unit: newProduct.unit,
        category: newProduct.category,
        image: newProduct.image, // Base64 data
        quantity: newProduct.quantity,
      }),
    });
    setProductManagementView('list');
    await fetchProducts(); // Refresh list
  };

  const handleDeleteProduct = async (id) => {
    if (window.confirm('Are you sure you want to delete this product? This action cannot be undone.')) { 
      try {
          await authenticatedFetch(`products/${id}`, { method: 'DELETE' });
          await fetchProducts(); // Refresh list
      } catch (error) {
          alert(`Deletion failed: ${error.message}`);
      }
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await authenticatedFetch(`orders/${orderId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      setSelectedOrder(null); // Close modal
      await fetchOrders(); // Refresh orders
    } catch (error) {
      alert(`Status update failed: ${error.message}`);
    }
  };

  const handlePlaceOrder = async (formData) => {
    const newOrderId = "ORD-" + Math.random().toString(36).substr(2, 9).toUpperCase();
    const items = checkoutSource === 'cart' ? cart : [directItem];
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const newOrder = {
      id: newOrderId,
      date: new Date().toISOString(),
      status: 'New Order', 
      customer: {
        name: formData.name,
        address: formData.address,
        upi: formData.upi,
        mobileNumber: formData.mobileNumber, 
      },
      // Send the actual screenshot data URL (if any) so backend can store a BLOB
      paymentScreenshot: formData.screenshot ? formData.screenshot : null,
      items: items.map(item => ({
        id: item.id,
        quantity: item.quantity,
        price: item.price
      })),
      totalAmount: total
    };

    try {
      // Compute expected delivery charge locally for display and send
      const expectedDelivery = computeDeliveryChargeClient(total, deliveryConfig.tiers, deliveryConfig.default_charge);
      newOrder.deliveryCharge = expectedDelivery;

      await authenticatedFetch('orders', {
        method: 'POST',
        body: JSON.stringify(newOrder),
      });

      setLastOrderId(newOrderId);
      setLastDeliveryCharge(expectedDelivery);
      
      if (checkoutSource === 'cart') {
        setCart([]);
      }
      
      setView('success');
      await fetchOrders(); // Update admin view if necessary
    } catch (error) {
        throw new Error(error.message); // Throw to be caught by CheckoutPage component
    }
  };

  // --- Initial Load Hooks (REPLACED localStorage with fetch) ---
  useEffect(() => {
    fetchProducts();
    fetchOrders();
    fetchDeliveryConfig();
    
    // Load local cart state (cart remains local for non-logged-in customers)
    const savedCart = localStorage.getItem('mkn_cart');
    if (savedCart) setCart(JSON.parse(savedCart));
  }, []);

  // If the user navigates directly to /admin, open the admin view on mount
  useEffect(() => {
    try {
      const p = window && window.location && window.location.pathname;
      if (p && (p === '/admin' || p.endsWith('/admin'))) {
        setView('admin');
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Persist local cart state
  useEffect(() => {
    localStorage.setItem('mkn_cart', JSON.stringify(cart));
  }, [cart]);


  // Handle Copy Status Timeout
  useEffect(() => {
    if (copyStatus) {
      const timer = setTimeout(() => setCopyStatus(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [copyStatus]);

  // --- Core Actions (Mostly the same, just removing persistence calls) ---

  const addToCart = (product, qty) => {
    setCart(prev => {
      const existing = prev.find(p => p.id === product.id);
      if (existing) {
        return prev.map(p => p.id === product.id ? { ...p, quantity: p.quantity + qty } : p);
      }
      return [...prev, { ...product, quantity: qty }];
    });
    setView('home');
  };

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateQuantity = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const handleProductClick = (product) => {
    setSelectedProduct({ ...product, quantity: 1 });
    setView('product');
  };

  const handleBuyNow = () => {
    setCheckoutSource('direct');
    setDirectItem(selectedProduct);
    setView('checkout');
  };

  const handleCartCheckout = () => {
    if (cart.length === 0) return;
    setCheckoutSource('cart');
    setView('checkout');
  };

  // --- Order Tracking State ---
  const [trackOrderId, setTrackOrderId] = useState('');
  const [foundOrder, setFoundOrder] = useState(null);
  const [searchError, setSearchError] = useState('');

  const handleTrackOrder = () => {
    setSearchError('');
    const order = orders.find(o => o.id === trackOrderId.trim());
    if (order) {
      setFoundOrder(order);
    } else {
      setFoundOrder(null);
      setSearchError('Order ID not found. Ensure the order was placed after connecting to the database.');
    }
  };

  // --- Admin Actions ---
  const handleAdminLogin = (username, password) => {
    // Attempt to verify credentials by calling a protected admin endpoint
    (async () => {
      try {
        const b64 = btoa(`${username}:${password}`);
        const resp = await fetch(`${API_URL.replace('/api','')}/api/admin/check`, {
          headers: { Authorization: 'Basic ' + b64 }
        });
        if (resp.ok) {
          setAdminAuthB64(b64);
          setIsAdminLoggedIn(true);
          setAdminLoginError('');
          // fetch admin delivery config after successful login
          setTimeout(() => fetchAdminDeliveryConfig(b64), 200);
          setAdminTab('orders');
          fetchOrders();
          return;
        }
        setAdminLoginError('Invalid username or password.');
      } catch (err) {
        console.error('Admin login failed:', err);
        setAdminLoginError('Failed to authenticate.');
      }
    })();
  };

  const handleAdminLogout = () => {
    setIsAdminLoggedIn(false);
    setView('home');
  }

  // Admin delivery config helpers
  const fetchAdminDeliveryConfig = async (b64) => {
    try {
      const auth = b64 || adminAuthB64;
      if (!auth) return;
      const resp = await fetch(`${API_URL.replace(/\/api\/?$/, '')}/api/admin/delivery`, {
        headers: { Authorization: 'Basic ' + auth }
      });
      if (!resp.ok) {
        console.warn('Failed to fetch admin delivery config');
        return;
      }
      const cfg = await resp.json();
      // Ensure shape
      cfg.tiers = cfg.tiers || [];
      cfg.default_charge = typeof cfg.default_charge !== 'undefined' ? cfg.default_charge : 0;
      cfg.note = cfg.note || '';
      setAdminDeliveryConfig(cfg);
    } catch (err) {
      console.error('Error fetching admin delivery config', err);
    }
  };

  const saveAdminDeliveryConfig = async (cfg) => {
    try {
      if (!adminAuthB64) { alert('Please login as admin'); return; }
      const resp = await fetch(`${API_URL.replace(/\/api\/?$/, '')}/api/admin/delivery`, {
        method: 'PUT',
        headers: { Authorization: 'Basic ' + adminAuthB64, 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({ error: resp.statusText }));
        alert('Failed to save delivery config: ' + (e.error || resp.statusText));
        return;
      }
      alert('Delivery configuration saved');
      setShowDeliveryModal(false);
      // update admin state and public config immediately
      setAdminDeliveryConfig(cfg);
      setDeliveryConfig(cfg);
      // refresh from server to ensure canonical state
      fetchDeliveryConfig();
    } catch (err) {
      console.error('Error saving admin delivery config', err);
      alert('Failed to save delivery config');
    }
  };


  // --- Render Functions ---

  const renderProductList = () => (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-800">Available Products ({products.length})</h3>
        <button 
          onClick={() => setProductManagementView('add')}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 flex items-center gap-2"
        >
          <Plus size={18} /> Add Product
        </button>
      </div>
      
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="hidden md:grid grid-cols-10 gap-4 p-4 font-bold border-b text-sm text-gray-600">
          <div className="col-span-1">ID</div>
          <div className="col-span-3">Product Name</div>
          <div className="col-span-2">Price / Unit</div>
          <div className="col-span-2">Category</div>
          <div className="col-span-2 text-center">Actions</div>
        </div>
        
        {dataLoading ? (
             <div className="p-6 text-center text-gray-500 flex items-center justify-center gap-2">
                 <Loader2 size={20} className="animate-spin" /> Loading products...
             </div>
        ) : products.length === 0 ? (
          <p className="p-6 text-center text-gray-500">No products available. Click "Add Product" to start.</p>
        ) : (
          products.map(product => (
            <div key={product.id} className="grid grid-cols-6 md:grid-cols-10 gap-4 items-center p-4 border-b last:border-b-0 hover:bg-gray-50">
              <div className="col-span-1 text-xs font-mono">{product.id}</div>
              <div className="col-span-3 flex items-center gap-3">
                <img src={product.image || `https://placehold.co/50x50/1e3a8a/ffffff?text=${product.name.substring(0, 1)}`} alt={product.name} className="w-10 h-10 object-cover rounded-md" />
                <span className="font-medium text-sm">{product.name}</span>
              </div>
              <div className="col-span-2 font-semibold text-blue-800">₹{product.price} / {product.unit}</div>
              <div className="col-span-2 text-sm text-gray-600">{product.category}</div>
              <div className="col-span-2 flex justify-center gap-2">
                <button 
                  onClick={() => { setProductToEdit(product); setProductManagementView('edit'); }}
                  className="p-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition"
                  title="Edit Product"
                >
                  <Edit size={16} />
                </button>
                <button 
                  onClick={() => handleDeleteProduct(product.id)}
                  className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
                  title="Delete Product"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderOrderManagement = () => {
    const OrderDetailModal = ({ order, onClose }) => (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden">
          <div className="bg-gray-800 text-white p-4 flex justify-between items-center">
            <h3 className="font-bold text-lg">Order Details: {order.id}</h3>
            <button onClick={onClose}><X size={20} /></button>
          </div>
          <div className="p-6 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div>
                <p className="text-gray-500">Customer</p>
                <div className="font-semibold">{order.customer.name}</div>
              </div>
              <div>
                <p className="text-gray-500">Mobile</p>
                <div className="font-semibold">{order.customer.mobileNumber}</div>
              </div>
              <div className="col-span-2">
                <p className="text-gray-500">Total Amount</p>
                <div className="font-semibold text-xl text-blue-800">₹{order.totalAmount}</div>
              </div>
              <div className="col-span-2">
                <p className="text-gray-500">Address</p>
                <div className="font-medium">{order.customer.address}</div>
              </div>
              <div className="col-span-2 bg-gray-50 p-3 rounded border">
                <p className="text-gray-500 text-xs">Payment Info</p>
                <div className="font-mono text-sm">UPI: {order.customer.upi}</div>
                <div className="text-xs mt-1 text-blue-600 font-medium flex items-center gap-1"> 
                   <div className="w-2 h-2 bg-blue-600 rounded-full"></div> {order.paymentScreenshot}
                </div>
                  {order.paymentScreenshot && typeof order.paymentScreenshot === 'string' && order.paymentScreenshot !== 'No Screenshot' && (
                    <div className="mt-3">
                      <button
                        onClick={async () => {
                            try {
                            if (!adminAuthB64) { alert('Please login as admin to view screenshots.'); return; }
                            const resp = await fetch(`${API_URL}/orders/${order.id}/screenshot`, {
                              headers: {
                                Authorization: 'Basic ' + adminAuthB64
                              }
                            });
                            if (!resp.ok) {
                              const e = await resp.json().catch(() => ({ error: resp.statusText }));
                              alert('Failed to load screenshot: ' + (e.error || resp.statusText));
                              return;
                            }
                            const contentType = resp.headers.get('content-type') || '';
                            if (contentType.startsWith('image/')) {
                              const blob = await resp.blob();
                              const url = URL.createObjectURL(blob);
                              window.open(url, '_blank');
                            } else {
                              const data = await resp.json().catch(() => null);
                              if (data && data.screenshot) {
                                // If it's already a data URL, display it directly.
                                if (typeof data.screenshot === 'string' && data.screenshot.startsWith('data:')) {
                                  const w = window.open();
                                  w.document.write(`<img src="${data.screenshot}" style="max-width:100%">`);
                                } else {
                                  // For other stored values (e.g. '/uploads/filename'), open a small helper page
                                  // that re-fetches the protected endpoint with Authorization and displays the image.
                                  try {
                                  if (!adminAuthB64) { alert('Please login as admin to view screenshots.'); return; }
                                  const authB64 = adminAuthB64;
                                  const w = window.open('', '_blank');
                                  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Screenshot</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;background:#111;color:#fff"><div id="app">Loading screenshot...</div><script> (async function(){
                                      try {
                                        const resp = await fetch('${API_URL}/orders/${order.id}/screenshot', { headers: { Authorization: 'Basic ${authB64}' } });
                                          if (!resp.ok) { document.getElementById('app').innerText = 'Failed to load screenshot: ' + resp.status; return; }
                                          const ct = resp.headers.get('content-type') || '';
                                          if (ct.startsWith('image/')) {
                                            const blob = await resp.blob();
                                            const url = URL.createObjectURL(blob);
                                            const img = document.createElement('img');
                                            img.src = url;
                                            img.style.maxWidth = '100%';
                                            img.style.maxHeight = '100vh';
                                            document.body.innerHTML = '';
                                            document.body.appendChild(img);
                                          } else {
                                            const data = await resp.json().catch(()=>null);
                                            if (data && data.screenshot) {
                                              const img = document.createElement('img');
                                              img.src = data.screenshot;
                                              img.style.maxWidth = '100%';
                                              img.style.maxHeight = '100vh';
                                              document.body.innerHTML = '';
                                              document.body.appendChild(img);
                                            } else {
                                              document.getElementById('app').innerText = 'No screenshot available';
                                            }
                                          }
                                        } catch (err) {
                                          document.getElementById('app').innerText = 'Error loading screenshot';
                                        }
                                      })();</script></body></html>`;
                                    w.document.write(html);
                                    w.document.close();
                                  } catch (err) {
                                    console.error('Failed to open helper window for screenshot:', err);
                                    alert('Failed to open screenshot viewer');
                                  }
                                }
                              } else {
                                alert('No screenshot available');
                              }
                            }
                          } catch (err) {
                            console.error('Error fetching screenshot:', err);
                            alert('Failed to load screenshot');
                          }
                        }}
                        className="inline-block bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700"
                      >
                        View Screenshot
                      </button>
                    </div>
                  )}
                  {/* Delete processed orders */}
                  {order.status === 'Order Processed' && (
                    <div className="mt-3">
                      <button
                        onClick={async () => {
                          if (!confirm('Delete this processed order? This cannot be undone.')) return;
                          try {
                            if (!adminAuthB64) { alert('Please login as admin to delete orders.'); return; }
                            const resp = await fetch(`${API_URL}/orders/${order.id}`, {
                              method: 'DELETE',
                              headers: {
                                Authorization: 'Basic ' + adminAuthB64,
                              },
                            });
                            if (!resp.ok) {
                              const err = await resp.json().catch(() => ({ error: resp.statusText }));
                              alert('Failed to delete order: ' + (err.error || resp.statusText));
                              return;
                            }
                            alert('Order deleted');
                            // Close modal and refresh orders
                            onClose();
                            await fetchOrders();
                          } catch (err) {
                            console.error('Error deleting order:', err);
                            alert('Failed to delete order');
                          }
                        }}
                        className="inline-block bg-red-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-red-700 ml-3"
                      >
                        Delete Order
                      </button>
                    </div>
                  )}
              </div>
            </div>

            <h4 className="font-bold border-b pb-2 mb-3">Products</h4>
            <ul className="space-y-2 mb-6">
              {order.items.map((item, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span>{item.name} <span className="text-gray-500">x{item.quantity}</span></span>
                  <span>₹{item.price * item.quantity}</span>
                </li>
              ))}
            </ul>

            <div className="flex gap-2">
               {order.status === 'New Order' && (
                 <button 
                   onClick={() => updateOrderStatus(order.id, 'Payment Done')}
                   className="flex-1 bg-orange-500 text-white py-2 rounded hover:bg-orange-600"
                 >
                   Mark Payment Done
                 </button>
               )}
               {order.status === 'Payment Done' && (
                 <button 
                   onClick={() => updateOrderStatus(order.id, 'Order Processed')}
                   className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700"
                 >
                   Process Order
                 </button>
               )}
               {order.status === 'Order Processed' && (
                 <button disabled className="flex-1 bg-gray-300 text-gray-500 py-2 rounded cursor-not-allowed">
                   Completed
                 </button>
               )}
            </div>
          </div>
        </div>
      </div>
    );
    
    const filteredOrders = orders.filter(o => {
      if (orderFilter === 'new') return o.status === 'New Order';
      if (orderFilter === 'paid') return o.status === 'Payment Done';
      if (orderFilter === 'processed') return o.status === 'Order Processed';
      return false;
    });

    return (
      <div>
        <div className="grid grid-cols-3 gap-2 mb-6">
          <button 
            onClick={() => setOrderFilter('new')}
            className={`py-2 px-1 text-sm md:text-base rounded-lg font-medium transition ${orderFilter === 'new' ? 'bg-blue-600 text-white shadow' : 'bg-white text-gray-600'}`}
          >
            New Orders
          </button>
          <button 
            onClick={() => setOrderFilter('paid')}
            className={`py-2 px-1 text-sm md:text-base rounded-lg font-medium transition ${orderFilter === 'paid' ? 'bg-orange-500 text-white shadow' : 'bg-white text-gray-600'}`}
          >
            Payment Done
          </button>
          <button 
            onClick={() => setOrderFilter('processed')}
            className={`py-2 px-1 text-sm md:text-base rounded-lg font-medium transition ${orderFilter === 'processed' ? 'bg-green-600 text-white shadow' : 'bg-white text-gray-600'}`}
          >
            Processed
          </button>
        </div>

        <div className="space-y-3">
          {orders.length === 0 ? (
            <p className="text-center text-gray-400 mt-10">Loading orders or database is empty...</p>
          ) : filteredOrders.length === 0 ? (
             <p className="text-center text-gray-400 mt-10">No orders in this category.</p>
          ) : (
            filteredOrders.map(order => (
              <div key={order.id} className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-500 flex justify-between items-center">
                <div>
                  <p className="font-bold text-gray-800">{order.id}</p>
                  <p className="text-sm text-gray-500">{order.customer.name} | {order.customer.mobileNumber}</p>
                  <p className="text-xs text-gray-400">{new Date(order.date).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-blue-900">₹{order.totalAmount}</p>
                  <button 
                    onClick={() => setSelectedOrder(order)}
                    className="text-xs mt-1 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded text-blue-600 font-medium"
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {selectedOrder && <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
      </div>
    );
  };

  const renderHome = () => {
    const filteredProducts = products.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <div className="pb-20">
        <div className="hidden md:block bg-blue-800 p-4 text-center">
          <div className="max-w-2xl mx-auto relative">
            <Search className="absolute left-3 top-2.5 text-blue-300" size={20} />
            <input 
              type="text" 
              placeholder="Search for products..." 
              className="w-full bg-blue-900 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-blue-300"
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <BannerSlider />

        <div className="container mx-auto px-4 py-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Package className="text-orange-500" /> Products
          </h2>
          
          {dataLoading ? (
            <div className="text-center py-20 text-gray-500 flex items-center justify-center gap-2">
                <Loader2 size={24} className="animate-spin" /> Loading product data from server...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-20 text-gray-500">No products found.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {filteredProducts.map(product => (
                <ProductCard key={product.id} product={product} onClick={handleProductClick} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderProductDetail = () => {
    if (!selectedProduct) return null;
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <button onClick={() => setView('home')} className="mb-6 flex items-center text-gray-600 hover:text-blue-900">
          <ArrowLeft className="mr-2" size={20} /> Back to Shop
        </button>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden grid md:grid-cols-2">
          <div className="bg-gray-100 p-8 flex items-center justify-center">
            <img src={selectedProduct.image || `https://placehold.co/400x400/1e3a8a/ffffff?text=${selectedProduct.name.substring(0, 1)}`} alt={selectedProduct.name} className="w-full h-64 md:h-80 object-contain mix-blend-multiply" />
          </div>
          <div className="p-6 md:p-10 flex flex-col justify-between">
            <div>
              <div className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold mb-3">
                {selectedProduct.category}
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{selectedProduct.name}</h2>
              <p className="text-3xl font-bold text-blue-600 mb-6">₹{selectedProduct.price} <span className="text-sm text-gray-400 font-normal">/ {selectedProduct.unit}</span></p>
              
              <div className="flex items-center gap-4 mb-8">
                <span className="font-medium text-gray-700">Quantity:</span>
                <div className="flex items-center border rounded-lg bg-gray-50">
                  <button 
                    className="p-3 hover:bg-gray-200 rounded-l-lg transition"
                    onClick={() => setSelectedProduct(p => ({ ...p, quantity: Math.max(1, p.quantity - 1) }))}
                  >
                    <Minus size={18} />
                  </button>
                  <span className="w-12 text-center font-bold">{selectedProduct.quantity}</span>
                  <button 
                    className="p-3 hover:bg-gray-200 rounded-r-lg transition"
                    onClick={() => setSelectedProduct(p => ({ ...p, quantity: p.quantity + 1 }))}
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => addToCart(selectedProduct, selectedProduct.quantity)}
                className="py-4 rounded-xl border-2 border-blue-900 text-blue-900 font-bold hover:bg-blue-50 transition"
              >
                Add to Cart
              </button>
              <button 
                onClick={handleBuyNow}
                className="py-4 rounded-xl bg-orange-500 text-white font-bold shadow-lg shadow-orange-200 hover:bg-orange-600 hover:translate-y-[-2px] transition"
              >
                Buy Now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCart = () => {
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Your Cart</h2>
          <button onClick={() => setView('home')} className="text-blue-600 hover:underline">Continue Shopping</button>
        </div>

        {/* Your Orders Section in Cart View */}
        <div className="bg-blue-50 p-4 rounded-xl mb-8 border border-blue-100">
          <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
            <ClipboardList size={18} /> Track Order (Uses current order list)
          </h3>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Enter Order ID (e.g. ORD-X9...)"
              className="flex-grow p-2 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={trackOrderId}
              onChange={(e) => setTrackOrderId(e.target.value)}
            />
            <button 
              onClick={handleTrackOrder}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Check
            </button>
          </div>
          {searchError && <p className="text-red-500 text-sm mt-2">{searchError}</p>}
          {foundOrder && (
            <div className="mt-4 bg-white p-3 rounded shadow-sm border text-sm">
              <div className="flex justify-between font-bold mb-2">
                <span>{foundOrder.id}</span>
                <span className={`
                  ${foundOrder.status === 'New Order' ? 'text-blue-600' : ''}
                  ${foundOrder.status === 'Payment Done' ? 'text-orange-600' : ''}
                  ${foundOrder.status === 'Order Processed' ? 'text-green-600' : ''}
                `}>{foundOrder.status}</span>
              </div>
              <p className="text-gray-600">Items: {foundOrder.items.length} | Total: ₹{foundOrder.totalAmount}</p>
            </div>
          )}
        </div>

        {cart.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 rounded-xl">
            <ShoppingCart size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Your cart is empty</p>
          </div>
        ) : (
          <div className="space-y-4">
            {cart.map(item => (
              <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border flex gap-4 items-center">
                <img src={item.image || `https://placehold.co/50x50/1e3a8a/ffffff?text=${item.name.substring(0, 1)}`} alt={item.name} className="w-16 h-16 object-cover rounded bg-gray-100" />
                <div className="flex-grow">
                  <h4 className="font-semibold text-gray-800">{item.name}</h4>
                  <p className="text-sm text-gray-500">₹{item.price} / {item.unit}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center hover:bg-gray-200">-</button>
                  <span className="w-4 text-center font-medium">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center hover:bg-gray-200">+</button>
                </div>
                <div className="text-right min-w-[80px]">
                  <p className="font-bold">₹{item.price * item.quantity}</p>
                  <button onClick={() => removeFromCart(item.id)} className="text-xs text-red-500 hover:underline mt-1">Remove</button>
                </div>
              </div>
            ))}

            <div className="mt-8 bg-white p-6 rounded-xl shadow-sm border">
              <div className="flex justify-between text-lg font-bold text-gray-800 mb-4">
                <span>Total Amount</span>
                <span>₹{total}</span>
              </div>
              <button 
                onClick={handleCartCheckout}
                className="w-full bg-blue-900 text-white py-4 rounded-xl font-bold hover:bg-blue-800 transition shadow-lg"
              >
                Proceed to Checkout
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSuccess = () => {
    const copyToClipboard = () => {
      const dummy = document.createElement("textarea");
      document.body.appendChild(dummy);
      dummy.value = lastOrderId;
      dummy.select();
      document.execCommand("copy");
      document.body.removeChild(dummy);
      setCopyStatus('copied');
    };

    return (
      <div className="container mx-auto px-4 py-12 max-w-md text-center">
        <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
          <CheckCircle size={48} />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Order Placed!</h2>
        <p className="text-gray-500 mb-8">Thank you for shopping with MKN Enterprises.</p>

        <div className="bg-gray-50 p-6 rounded-xl border border-dashed border-gray-300 mb-8 text-left">
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Order ID</p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-2xl font-mono font-bold text-gray-800">{lastOrderId}</span>
            <div>
              <button onClick={copyToClipboard} className="text-blue-600 hover:text-blue-800 mr-3">
                <Copy size={20} />
              </button>
            </div>
          </div>
          {copyStatus === 'copied' && (
             <div className="mt-3 text-sm text-green-600 font-medium">Order ID copied!</div>
          )}

          <div className="mt-4 border-t pt-3 text-sm">
            <div className="flex justify-between"><span>Delivery Charge</span><span className="font-medium">{parseFloat(lastDeliveryCharge || 0) === 0 ? 'Free' : `₹${parseFloat(lastDeliveryCharge).toFixed(2)}`}</span></div>
            {(() => {
              const tiers = deliveryConfig && Array.isArray(deliveryConfig.tiers) ? deliveryConfig.tiers : [];
              const zeroTiers = tiers.filter(t => parseFloat(t.charge || 0) === 0);
              if (zeroTiers.length > 0) {
                const mins = zeroTiers.map(t => parseFloat(t.min_amount || 0));
                const threshold = Math.min(...mins);
                if (!isNaN(threshold) && threshold > 0) {
                  return <div className="text-sm text-gray-500 mt-2">Order for more than ₹{threshold.toFixed(2)} to avail free delivery</div>;
                }
              }
              return null;
            })()}
            <div className="flex justify-between mt-2"><span className="font-bold">Total Paid</span><span className="font-bold">₹{ /* show subtotal+delivery if available */ }</span></div>
          </div>
        </div>

        <button 
          onClick={() => setView('home')}
          className="bg-blue-900 text-white px-8 py-3 rounded-full font-semibold hover:bg-blue-800 transition"
        >
          Continue Shopping
        </button>
      </div>
    );
  };
  
  // --- Main Admin Render Function ---
  const renderAdmin = () => {
    return (
      <div className="min-h-screen bg-gray-100 pb-20">
        <header className="bg-gray-800 text-white p-4 flex justify-between items-center shadow">
          <h1 className="text-xl font-bold flex items-center gap-2"><User size={24}/> Admin Panel</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowDeliveryModal(true); fetchAdminDeliveryConfig(); }} className="text-sm bg-blue-600 px-3 py-1 rounded hover:bg-blue-500">Delivery Settings</button>
            <button onClick={handleAdminLogout} className="text-sm bg-gray-700 px-3 py-1 rounded hover:bg-gray-600">Log Out</button>
          </div>
        </header>

        <div className="container mx-auto p-4">
          
          {/* Admin Navigation Tabs */}
          <div className="flex bg-white p-1 rounded-xl shadow-md mb-6">
            <button 
              onClick={() => setAdminTab('orders')}
              className={`flex-1 py-3 font-semibold rounded-lg flex items-center justify-center gap-2 transition ${adminTab === 'orders' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <List size={20} /> Order Management
            </button>
            <button 
              onClick={() => {setAdminTab('products'); fetchProducts();}} // Re-fetch products just in case
              className={`flex-1 py-3 font-semibold rounded-lg flex items-center justify-center gap-2 transition ${adminTab === 'products' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <Package size={20} /> Product Stock
            </button>
          </div>

          {/* Content Switch */}
          {adminTab === 'orders' && renderOrderManagement()}
          {adminTab === 'products' && (
            <div className="p-4 bg-white rounded-xl shadow">
              {productManagementView === 'list' && renderProductList()}
              {(productManagementView === 'add' || productManagementView === 'edit') && (
                <ProductForm 
                  isEditing={productManagementView === 'edit'}
                  productToEdit={productToEdit}
                  handleUpdateProduct={handleUpdateProduct}
                  handleAddProduct={handleAddProduct}
                  setProductManagementView={setProductManagementView}
                />
              )}
            </div>
          )}
        </div>
        {showDeliveryModal && (
          <DeliverySettingsModal onClose={() => setShowDeliveryModal(false)} config={adminDeliveryConfig} setConfig={setAdminDeliveryConfig} onSave={saveAdminDeliveryConfig} />
        )}
      </div>
    );
  };

  // Delivery Settings Modal Component
  const DeliverySettingsModal = ({ onClose, config, setConfig, onSave }) => {
    const [local, setLocal] = useState(() => ({ tiers: (config && config.tiers) ? config.tiers.map(t => ({ ...t })) : [], default_charge: config && config.default_charge ? config.default_charge : 0, note: config && config.note ? config.note : '' }));

    useEffect(() => {
      setLocal({ tiers: (config && config.tiers) ? config.tiers.map(t => ({ ...t })) : [], default_charge: config && config.default_charge ? config.default_charge : 0, note: config && config.note ? config.note : '' });
    }, [config]);

    const addTier = () => setLocal(l => ({ ...l, tiers: [...l.tiers, { min_amount: 0, max_amount: null, charge: 0 }] }));
    const removeTier = (i) => setLocal(l => ({ ...l, tiers: l.tiers.filter((_, idx) => idx !== i) }));
    const updateTier = (i, key, value) => setLocal(l => ({ ...l, tiers: l.tiers.map((t, idx) => idx === i ? ({ ...t, [key]: value }) : t) }));

    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold">Delivery Settings</h3>
            <div className="flex items-center gap-2">
                <button onClick={() => { if (onSave) { onSave(local); } }} className="bg-green-600 text-white px-3 py-1 rounded">Save</button>
                <button onClick={onClose} className="bg-gray-200 px-3 py-1 rounded">Close</button>
              </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Delivery Charge (used when no tier matches)</label>
            <input type="number" value={local.default_charge} onChange={e => setLocal(l => ({ ...l, default_charge: parseFloat(e.target.value || 0) }))} className="p-2 border rounded w-48" />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Note (shown on checkout/success)</label>
            <textarea value={local.note} onChange={e => setLocal(l => ({ ...l, note: e.target.value }))} className="p-2 border rounded w-full" rows={3} placeholder="e.g. Orders above ₹500 qualify for free delivery" />
          </div>

          <div>
            <h4 className="font-semibold mb-2">Tiers (min_amount, max_amount, charge)</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {local.tiers.map((t, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="number" value={t.min_amount} onChange={e => updateTier(i, 'min_amount', e.target.value)} className="p-2 border rounded w-28" />
                  <input type="number" value={t.max_amount ?? ''} placeholder="(null)" onChange={e => updateTier(i, 'max_amount', e.target.value === '' ? null : e.target.value)} className="p-2 border rounded w-28" />
                  <input type="number" value={t.charge} onChange={e => updateTier(i, 'charge', e.target.value)} className="p-2 border rounded w-28" />
                  <button onClick={() => removeTier(i)} className="text-red-600">Remove</button>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <button onClick={addTier} className="bg-blue-600 text-white px-3 py-1 rounded">Add Tier</button>
            </div>
          </div>
        </div>
      </div>
    );
  };


  // --- Main Render Switch ---
  
  // Guard Admin access first
  if (view === 'admin' && !isAdminLoggedIn) {
    return <AdminLoginPage onLogin={handleAdminLogin} error={adminLoginError} />;
  }

  // Render Admin Dashboard if logged in
  if (view === 'admin' && isAdminLoggedIn) {
    return renderAdmin();
  }
  
  // Calculate checkout props here, unconditionally
  const checkoutItems = checkoutSource === 'cart' ? cart : [directItem];
  // Guard against null directItem if view is 'checkout' but directItem is unexpectedly null
  const validCheckoutItems = checkoutItems.filter(Boolean); 

  const checkoutTotal = validCheckoutItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex flex-col">
      <Header 
        cartCount={cart.reduce((acc, item) => acc + item.quantity, 0)}
        onCartClick={() => setView('cart')} 
        onHomeClick={() => setView('home')}
        onSearch={setSearchQuery}
      />
      
      <main className="flex-grow">
        {view === 'home' && renderHome()}
        {view === 'product' && renderProductDetail()}
        {view === 'cart' && renderCart()}
        
        {/* Conditionally render the new CheckoutPage component */}
        {view === 'checkout' && validCheckoutItems.length > 0 && (
          <CheckoutPage
            items={validCheckoutItems}
            total={checkoutTotal}
            deliveryConfig={deliveryConfig}
            deliveryCharge={computeDeliveryChargeClient(checkoutTotal, deliveryConfig.tiers, deliveryConfig.default_charge)}
            onPlaceOrder={handlePlaceOrder}
            onBack={() => setView(checkoutSource === 'cart' ? 'cart' : 'product')}
          />
        )}

        {view === 'success' && renderSuccess()}
        
        {/* Placeholder if somehow checkout fails but view is set to checkout without items */}
        {view === 'checkout' && validCheckoutItems.length === 0 && (
             <div className="text-center py-20">Cart/Direct item is empty. <button onClick={() => setView('home')} className="text-blue-600 underline">Go Home</button></div>
        )}
      </main>

      {/* Footer with Admin Link */}
      <footer className="bg-blue-950 text-blue-300 py-8 mt-auto">
        <div className="container mx-auto px-4 text-center">
          <p className="font-bold text-white text-lg mb-2">MKN Enterprises</p>
          <p className="text-sm mb-4">Premium Quality Wholesale Products</p>
          <div className="flex justify-center gap-4 text-xs mb-6">
            <span>Terms</span>
            <span>Privacy</span>
            <span>Contact</span>
          </div>
          {/* Admin panel is accessible at /admin — removed public footer button for security */}
          <p className="text-[10px] mt-4 opacity-30">© 2024 MKN Enterprises. All rights reserved. <br />
           Developed by <a className="text-[13px]" href="https://darkpixels.in" target="_blank" rel="noopener noreferrer">DARKPIXELS</a></p>
        </div>
      </footer>
    </div>
  );
}
