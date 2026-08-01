const axios = require('axios');

class CloudflareApi {
  constructor(accountId, apiToken) {
    this.accountId = accountId;
    this.apiToken = apiToken;
    
    this.client = axios.create({
      baseURL: 'https://api.cloudflare.com/client/v4',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // Fetch tunnel configuration (ingress rules)
  async getTunnelConfig(tunnelId) {
    try {
      const response = await this.client.get(`/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/configurations`);
      return response.data.result;
    } catch (err) {
      console.error('Error fetching tunnel config:', err.response?.data || err.message);
      throw new Error(err.response?.data?.errors?.[0]?.message || 'Failed to fetch tunnel configurations from Cloudflare.');
    }
  }

  // Update tunnel configuration (ingress rules)
  async updateTunnelConfig(tunnelId, ingressRules) {
    try {
      const response = await this.client.put(`/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/configurations`, {
        config: {
          ingress: ingressRules
        }
      });
      return response.data.result;
    } catch (err) {
      console.error('Error updating tunnel config:', err.response?.data || err.message);
      throw new Error(err.response?.data?.errors?.[0]?.message || 'Failed to update tunnel configurations on Cloudflare.');
    }
  }

  // Fetch Zone ID for a domain
  async getZoneId(domainName) {
    try {
      const response = await this.client.get('/zones', {
        params: { name: domainName }
      });
      
      const zones = response.data.result;
      if (!zones || zones.length === 0) {
        throw new Error(`Domain "${domainName}" was not found in your Cloudflare account.`);
      }
      return zones[0].id;
    } catch (err) {
      console.error('Error fetching zone ID:', err.response?.data || err.message);
      throw new Error(err.response?.data?.errors?.[0]?.message || `Failed to find Zone ID for domain ${domainName}.`);
    }
  }

  // Create DNS CNAME record pointing to tunnel
  async createCnameRecord(zoneId, hostname, tunnelId) {
    try {
      const response = await this.client.post(`/zones/${zoneId}/dns_records`, {
        type: 'CNAME',
        name: hostname,
        content: `${tunnelId}.cfargotunnel.com`,
        ttl: 1, // Automatic
        proxied: true
      });
      return response.data.result;
    } catch (err) {
      // Ignore if record already exists error, but log it
      console.error('Error creating DNS record:', err.response?.data || err.message);
      const msg = err.response?.data?.errors?.[0]?.message || '';
      if (msg.includes('already exists') || msg.includes('Record already exists')) {
        return { alreadyExists: true };
      }
      throw new Error(msg || 'Failed to create CNAME DNS record in Cloudflare.');
    }
  }

  // Fetch DNS Records for a Zone to find matching CNAMES (for delete/list reference)
  async getDnsRecords(zoneId, domainName) {
    try {
      const response = await this.client.get(`/zones/${zoneId}/dns_records`, {
        params: { type: 'CNAME' }
      });
      return response.data.result;
    } catch (err) {
      console.error('Error fetching DNS records:', err.response?.data || err.message);
      return [];
    }
  }

  // Delete a DNS record
  async deleteDnsRecord(zoneId, recordId) {
    try {
      await this.client.delete(`/zones/${zoneId}/dns_records/${recordId}`);
      return true;
    } catch (err) {
      console.error('Error deleting DNS record:', err.response?.data || err.message);
      throw new Error(err.response?.data?.errors?.[0]?.message || 'Failed to delete CNAME DNS record from Cloudflare.');
    }
  }
}

module.exports = CloudflareApi;
