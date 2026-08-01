class ApiMonitor {
  constructor(wsBroadcastCallback) {
    this.wsBroadcast = wsBroadcastCallback || (() => {});
    this.metrics = {
      totalRequests: 0,
      successRequests: 0,
      failedRequests: 0,
      avgResponseTimeMs: 0,
      responseTimeSum: 0,
      recentRequests: [],
      recentFailures: [],
      trafficHistory: [] // counts of requests per 5s interval
    };

    this.currentIntervalRequests = 0;
    this.historyInterval = setInterval(() => {
      this.metrics.trafficHistory.push(this.currentIntervalRequests);
      this.currentIntervalRequests = 0;
      if (this.metrics.trafficHistory.length > 30) {
        this.metrics.trafficHistory.shift();
      }
      this.notifyChanged();
    }, 5000);
  }

  middleware() {
    return (req, res, next) => {
      // Exclude polling/telemetry routes to keep diagnostics logs relevant
      const isPoll = req.path === '/api/status' || 
                     req.path === '/api/startup/status' || 
                     req.path === '/api/database/settings' ||
                     req.path.startsWith('/api/db/') && req.path.endsWith('/query') && req.headers['x-api-key'] === undefined; // only keep true queries

      if (!req.path.startsWith('/api') || isPoll) {
        return next();
      }

      const start = Date.now();
      this.currentIntervalRequests++;

      // Intercept res.send to capture error payloads for status codes >= 400
      const originalSend = res.send;
      res.send = function (body) {
        try {
          if (res.statusCode >= 400 && body) {
            let parsed = body;
            if (typeof body === 'string') {
              try {
                parsed = JSON.parse(body);
              } catch (e) {}
            }
            res.locals.errorMessage = parsed.error || parsed.message || (typeof body === 'string' ? body : JSON.stringify(body));
          }
        } catch (e) {
          console.error('Error intercepting res.send:', e);
        }
        return originalSend.apply(this, arguments);
      };

      res.on('finish', () => {
        const duration = Date.now() - start;
        const statusCode = res.statusCode;
        const success = statusCode < 400;

        this.metrics.totalRequests++;
        if (success) {
          this.metrics.successRequests++;
        } else {
          this.metrics.failedRequests++;
        }

        this.metrics.responseTimeSum += duration;
        const completedCount = this.metrics.successRequests + this.metrics.failedRequests;
        this.metrics.avgResponseTimeMs = Math.round(this.metrics.responseTimeSum / Math.max(1, completedCount));

        const requestEntry = {
          id: Math.random().toString(36).substring(2, 9),
          method: req.method,
          path: req.path,
          statusCode,
          duration,
          timestamp: new Date().toISOString()
        };

        this.metrics.recentRequests.unshift(requestEntry);
        if (this.metrics.recentRequests.length > 50) {
          this.metrics.recentRequests.pop();
        }

        if (!success) {
          const failureEntry = {
            id: requestEntry.id,
            method: req.method,
            path: req.path,
            statusCode,
            duration,
            ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            timestamp: requestEntry.timestamp,
            errorMessage: res.locals.errorMessage || 'HTTP Error ' + statusCode
          };
          this.metrics.recentFailures.unshift(failureEntry);
          if (this.metrics.recentFailures.length > 50) {
            this.metrics.recentFailures.pop();
          }
        }

        this.notifyChanged();
      });

      next();
    };
  }

  getMetrics() {
    return this.metrics;
  }

  notifyChanged() {
    this.wsBroadcast({
      type: 'api_metrics',
      data: this.metrics
    });
  }

  destroy() {
    if (this.historyInterval) {
      clearInterval(this.historyInterval);
    }
  }
}

module.exports = ApiMonitor;
