"""
Connection Metrics Module
Tracks network connection errors and statistics for monitoring.
"""
import threading
from typing import Dict
from datetime import datetime

class ConnectionMetrics:
    """Thread-safe singleton for tracking connection metrics."""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._initialized = True
        self._metrics_lock = threading.Lock()
        self.reset()
    
    def reset(self):
        """Reset all metrics to zero."""
        with self._metrics_lock:
            self._metrics = {
                "total_requests": 0,
                "successful_requests": 0,
                "connection_reset": 0,
                "timeout": 0,
                "dns_error": 0,
                "ssl_error": 0,
                "other_errors": 0,
                "last_reset": datetime.now().isoformat()
            }
    
    def record_request(self):
        """Record a new request attempt."""
        with self._metrics_lock:
            self._metrics["total_requests"] += 1
    
    def record_success(self):
        """Record a successful request."""
        with self._metrics_lock:
            self._metrics["successful_requests"] += 1
    
    def record_connection_reset(self):
        """Record a ConnectionResetError."""
        with self._metrics_lock:
            self._metrics["connection_reset"] += 1
    
    def record_timeout(self):
        """Record a TimeoutError."""
        with self._metrics_lock:
            self._metrics["timeout"] += 1
    
    def record_dns_error(self):
        """Record a DNS error."""
        with self._metrics_lock:
            self._metrics["dns_error"] += 1
    
    def record_ssl_error(self):
        """Record an SSL error."""
        with self._metrics_lock:
            self._metrics["ssl_error"] += 1
    
    def record_other_error(self):
        """Record an uncategorized error."""
        with self._metrics_lock:
            self._metrics["other_errors"] += 1
    
    def get_metrics(self) -> Dict:
        """Get current metrics snapshot."""
        with self._metrics_lock:
            return self._metrics.copy()
    
    def get_error_rate(self) -> float:
        """Calculate error rate as percentage."""
        with self._metrics_lock:
            total = self._metrics["total_requests"]
            if total == 0:
                return 0.0
            errors = (
                self._metrics["connection_reset"] +
                self._metrics["timeout"] +
                self._metrics["dns_error"] +
                self._metrics["ssl_error"] +
                self._metrics["other_errors"]
            )
            return (errors / total) * 100


# Global instance
connection_metrics = ConnectionMetrics()
