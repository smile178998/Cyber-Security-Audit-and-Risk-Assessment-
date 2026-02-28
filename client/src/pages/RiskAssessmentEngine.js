import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Paper,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Avatar,
  Fade,
  Zoom,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Assessment,
  Warning,
  Error,
  CheckCircle,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ScatterChart, Scatter, XAxis as XAxisScatter, YAxis as YAxisScatter } from 'recharts';
import api from '../utils/api';

const RiskAssessmentEngine = () => {
  const [assets, setAssets] = useState([]);
  const [vulnerabilities, setVulnerabilities] = useState([]);
  const [assetVulnerabilities, setAssetVulnerabilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState('');
  const [riskCriteria, setRiskCriteria] = useState({
    high: 12,
    medium: 8,
    low: 4,
  });

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, []);

  const likelihoodLabel = (value) => {
    if (typeof value === 'number') {
      if (value <= 2) return 'Low';
      if (value === 3) return 'Medium';
      return 'High';
    }
    if (value === 'Very High' || value === 'Critical') return 'High';
    return value || 'Medium';
  };

  const impactLabel = (value) => {
    if (typeof value === 'number') {
      if (value <= 1) return 'Low';
      if (value === 2) return 'Medium';
      if (value === 3) return 'High';
      return 'Critical';
    }
    if (value === 'Very High') return 'Critical';
    return value || 'Medium';
  };

  const fetchData = async () => {
    try {
      setError('');
      const [assetsRes, vulnsRes, assetVulnsRes] = await Promise.all([
        api.get('/assets'),
        api.get('/vulnerabilities'),
        api.get('/assets-vulnerabilities'),
      ]);
      setAssets(assetsRes.data.data || []);
      setVulnerabilities(vulnsRes.data.data || []);

      const allAssetVulns = (assetVulnsRes.data.data || [])
        .map((item) => ({
          ...item,
          likelihood: likelihoodLabel(item.likelihood),
          impact: impactLabel(item.impact),
          risk_score: Number(item.risk_score || 0),
        }));
      setAssetVulnerabilities(allAssetVulns);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError(error.response?.data?.error || 'Failed to load risk engine data.');
    } finally {
      setLoading(false);
    }
  };

  // Risk calculation and classification
  const getRiskLevel = (score) => {
    if (score >= riskCriteria.high) return { level: 'Critical', color: '#d32f2f', bgColor: '#ffebee' };
    if (score >= riskCriteria.medium) return { level: 'High', color: '#f57c00', bgColor: '#fff8e1' };
    if (score >= riskCriteria.low) return { level: 'Medium', color: '#1976d2', bgColor: '#e3f2fd' };
    return { level: 'Low', color: '#388e3c', bgColor: '#e8f5e8' };
  };

  // Risk matrix data
  const getRiskMatrixData = () => {
    const matrix = [];
    const likelihoods = ['Low', 'Medium', 'High'];
    const impacts = ['Low', 'Medium', 'High', 'Critical'];
    
    likelihoods.forEach(likelihood => {
      impacts.forEach(impact => {
        const score = getRiskScore(likelihood, impact);
        const risk = getRiskLevel(score);
        const count = assetVulnerabilities.filter(av => 
          av.likelihood === likelihood && av.impact === impact
        ).length;
        
        matrix.push({
          likelihood,
          impact,
          score,
          risk: risk.level,
          count,
          color: risk.color,
        });
      });
    });
    
    return matrix;
  };

  const getRiskScore = (likelihood, impact) => {
    const scores = {
      'Low-Low': 1.0, 'Low-Medium': 2.0, 'Low-High': 3.0, 'Low-Critical': 4.0,
      'Medium-Low': 2.0, 'Medium-Medium': 4.0, 'Medium-High': 6.0, 'Medium-Critical': 8.0,
      'High-Low': 3.0, 'High-Medium': 6.0, 'High-High': 9.0, 'High-Critical': 12.0
    };
    return scores[`${likelihood}-${impact}`] || 4.0;
  };

  // Risk distribution for charts
  const getRiskDistribution = () => {
    const distribution = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    
    assetVulnerabilities.forEach(av => {
      const risk = getRiskLevel(av.risk_score);
      distribution[risk.level]++;
    });
    
    return Object.entries(distribution).map(([level, count]) => ({
      name: level,
      value: count,
      color: getRiskLevel(
        level === 'Critical' ? 12 : level === 'High' ? 8 : level === 'Medium' ? 4 : 1
      ).color,
    }));
  };

  // Asset risk data for scatter plot
  const getAssetRiskData = () => {
    return assets.map(asset => {
      const assetVulns = assetVulnerabilities.filter(av => av.asset_id === asset.id);
      const maxRisk = assetVulns.length > 0 ? Math.max(...assetVulns.map(av => av.risk_score || 0)) : 0;
      const avgRisk = assetVulns.length > 0 ? 
        assetVulns.reduce((sum, av) => sum + (av.risk_score || 0), 0) / assetVulns.length : 0;
      
      return {
        name: asset.name,
        ciaValue: (!asset.cia_value || asset.cia_value === 'Low') ? 1 : asset.cia_value === 'Medium' ? 2 : 3,
        avgRisk: avgRisk,
        maxRisk: maxRisk,
        vulnerabilityCount: assetVulns.length,
      };
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Typography>Loading risk assessment engine...</Typography>
      </Box>
    );
  }

  const riskDistribution = getRiskDistribution();
  const riskMatrixData = getRiskMatrixData();
  const renderRiskDistributionLabel = ({ cx, cy, midAngle, outerRadius, name, value, fill }) => {
    if (!value) return null;
    const radian = Math.PI / 180;
    const labelRadius = outerRadius + 16;
    const x = cx + labelRadius * Math.cos(-midAngle * radian);
    const y = cy + labelRadius * Math.sin(-midAngle * radian);
    return (
      <text
        x={x}
        y={y}
        fill={fill}
        fontSize={14}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
      >
        {`${name}: ${value}`}
      </text>
    );
  };
  const assetRiskData = getAssetRiskData();

  return (
    <Box sx={{ flexGrow: 1, p: { xs: 2, md: 4 } }}>
      {/* Header */}
      <Fade in={mounted}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: 'grey.800' }}>
            Risk Assessment Engine
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Quantitative and qualitative risk evaluation (OCTAVE Allegro Steps 5-6)
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
          {!error && assetVulnerabilities.length === 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              No risk data yet. Add assets and link vulnerabilities in `Threat & Vulnerability Identification` first.
            </Alert>
          )}
        </Box>
      </Fade>

      {/* Risk Criteria Settings */}
      <Fade in={mounted} style={{ transitionDelay: '100ms' }}>
        <Card sx={{ mb: 3, p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            Risk Classification Criteria
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Risk Score = Likelihood × Impact
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Critical Risk Threshold (≥)</InputLabel>
                <Select
                  value={riskCriteria.high}
                  onChange={(e) => setRiskCriteria({ ...riskCriteria, high: parseInt(e.target.value) })}
                >
                  <MenuItem value={12}>12.0</MenuItem>
                  <MenuItem value={10}>10.0</MenuItem>
                  <MenuItem value={8}>8.0</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>High Risk Threshold (≥)</InputLabel>
                <Select
                  value={riskCriteria.medium}
                  onChange={(e) => setRiskCriteria({ ...riskCriteria, medium: parseInt(e.target.value) })}
                >
                  <MenuItem value={8}>8.0</MenuItem>
                  <MenuItem value={6}>6.0</MenuItem>
                  <MenuItem value={4}>4.0</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Medium Risk Threshold (≥)</InputLabel>
                <Select
                  value={riskCriteria.low}
                  onChange={(e) => setRiskCriteria({ ...riskCriteria, low: parseInt(e.target.value) })}
                >
                  <MenuItem value={4}>4.0</MenuItem>
                  <MenuItem value={2}>2.0</MenuItem>
                  <MenuItem value={1}>1.0</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Card>
      </Fade>

      {/* Risk Overview Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Zoom in={mounted} style={{ transitionDelay: '200ms' }}>
            <Card sx={{ background: 'linear-gradient(135deg, #d32f2f 0%, #f44336 100%)', color: 'white' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      {riskDistribution.find(r => r.name === 'Critical')?.value || 0}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Critical Risks
                    </Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}>
                    <Error />
                  </Avatar>
                </Box>
              </CardContent>
            </Card>
          </Zoom>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Zoom in={mounted} style={{ transitionDelay: '300ms' }}>
            <Card sx={{ background: 'linear-gradient(135deg, #f57c00 0%, #ff9800 100%)', color: 'white' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      {riskDistribution.find(r => r.name === 'High')?.value || 0}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      High Risks
                    </Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}>
                    <Warning />
                  </Avatar>
                </Box>
              </CardContent>
            </Card>
          </Zoom>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Zoom in={mounted} style={{ transitionDelay: '400ms' }}>
            <Card sx={{ background: 'linear-gradient(135deg, #1976d2 0%, #2196f3 100%)', color: 'white' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      {riskDistribution.find(r => r.name === 'Medium')?.value || 0}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Medium Risks
                    </Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}>
                    <Assessment />
                  </Avatar>
                </Box>
              </CardContent>
            </Card>
          </Zoom>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Zoom in={mounted} style={{ transitionDelay: '500ms' }}>
            <Card sx={{ background: 'linear-gradient(135deg, #388e3c 0%, #4caf50 100%)', color: 'white' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>
                      {riskDistribution.find(r => r.name === 'Low')?.value || 0}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Low Risks
                    </Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}>
                    <CheckCircle />
                  </Avatar>
                </Box>
              </CardContent>
            </Card>
          </Zoom>
        </Grid>
      </Grid>

      {/* Risk Matrix Visualization */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={8}>
          <Fade in={mounted} style={{ transitionDelay: '600ms' }}>
            <Card sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Risk Matrix (Likelihood × Impact)
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ border: 1, borderColor: '#ddd', textAlign: 'center' }}>Impact ↓</TableCell>
                      <TableCell sx={{ border: 1, borderColor: '#ddd', textAlign: 'center', fontWeight: 'bold' }}>Low</TableCell>
                      <TableCell sx={{ border: 1, borderColor: '#ddd', textAlign: 'center', fontWeight: 'bold' }}>Medium</TableCell>
                      <TableCell sx={{ border: 1, borderColor: '#ddd', textAlign: 'center', fontWeight: 'bold' }}>High</TableCell>
                      <TableCell sx={{ border: 1, borderColor: '#ddd', textAlign: 'center', fontWeight: 'bold' }}>Critical</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {['High', 'Medium', 'Low'].map(likelihood => (
                      <TableRow key={likelihood}>
                        <TableCell sx={{ border: 1, borderColor: '#ddd', fontWeight: 'bold', textAlign: 'center' }}>
                          {likelihood}
                        </TableCell>
                        {['Low', 'Medium', 'High', 'Critical'].map(impact => {
                          const score = getRiskScore(likelihood, impact);
                          const risk = getRiskLevel(score);
                          const count = riskMatrixData.find(r => r.likelihood === likelihood && r.impact === impact)?.count || 0;
                          return (
                            <TableCell
                              key={impact}
                              sx={{
                                border: 1,
                                borderColor: '#ddd',
                                backgroundColor: risk.bgColor,
                                textAlign: 'center',
                                cursor: 'pointer',
                                '&:hover': { backgroundColor: risk.color, color: 'white' }
                              }}
                            >
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {score.toFixed(1)}
                                </Typography>
                                <Typography variant="caption">
                                  {risk.level}
                                </Typography>
                                {count > 0 && (
                                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                                    ({count})
                                  </Typography>
                                )}
                              </Box>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell sx={{ border: 1, borderColor: '#ddd', textAlign: 'center' }}>
                        <Typography variant="caption">Likelihood →</Typography>
                      </TableCell>
                      <TableCell sx={{ border: 1, borderColor: '#ddd', textAlign: 'center' }}>
                        <Typography variant="caption">Low</Typography>
                      </TableCell>
                      <TableCell sx={{ border: 1, borderColor: '#ddd', textAlign: 'center' }}>
                        <Typography variant="caption">Medium</Typography>
                      </TableCell>
                      <TableCell sx={{ border: 1, borderColor: '#ddd', textAlign: 'center' }}>
                        <Typography variant="caption">High</Typography>
                      </TableCell>
                      <TableCell sx={{ border: 1, borderColor: '#ddd', textAlign: 'center' }}>
                        <Typography variant="caption">-</Typography>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          </Fade>
        </Grid>

        <Grid item xs={12} md={4}>
          <Fade in={mounted} style={{ transitionDelay: '700ms' }}>
            <Card sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Risk Distribution
              </Typography>
              <ResponsiveContainer width="100%" height={290}>
                <PieChart margin={{ top: 16, right: 44, left: 44, bottom: 16 }}>
                  <Pie
                    data={riskDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderRiskDistributionLabel}
                    outerRadius={72}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {riskDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </Fade>
        </Grid>
      </Grid>

      {/* Asset Risk Analysis */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12}>
          <Fade in={mounted} style={{ transitionDelay: '800ms' }}>
            <Card sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Asset Risk Analysis (CIA Value vs Risk Score)
              </Typography>
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxisScatter 
                    dataKey="ciaValue" 
                    domain={[0.5, 3.5]}
                    ticks={[1, 2, 3]}
                    tickFormatter={(value) => ['Low', 'Medium', 'High'][value - 1]}
                    label={{ value: 'CIA Value', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxisScatter 
                    dataKey="maxRisk" 
                    domain={[0, 13]}
                    label={{ value: 'Max Risk Score', angle: -90, position: 'insideLeft' }}
                  />
                  <RechartsTooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <Paper sx={{ p: 2 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {data.name}
                            </Typography>
                            <Typography variant="caption">
                              CIA: {['Low', 'Medium', 'High'][data.ciaValue - 1]}
                            </Typography>
                            <Typography variant="caption">
                              Max Risk: {data.maxRisk.toFixed(1)}
                            </Typography>
                            <Typography variant="caption">
                              Avg Risk: {data.avgRisk.toFixed(1)}
                            </Typography>
                            <Typography variant="caption">
                              Vulnerabilities: {data.vulnerabilityCount}
                            </Typography>
                          </Paper>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter name="Assets" data={assetRiskData} fill="#6366f1" />
                </ScatterChart>
              </ResponsiveContainer>
            </Card>
          </Fade>
        </Grid>
      </Grid>

      {/* Top Risk Items */}
      <Fade in={mounted} style={{ transitionDelay: '900ms' }}>
        <Card sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            Top Risk Items
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Asset</TableCell>
                  <TableCell>Vulnerability</TableCell>
                  <TableCell>Likelihood</TableCell>
                  <TableCell>Impact</TableCell>
                  <TableCell>Risk Score</TableCell>
                  <TableCell>Risk Level</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assetVulnerabilities
                  .slice()
                  .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
                  .slice(0, 10)
                  .map((av) => {
                    const asset = assets.find(a => a.id === av.asset_id);
                    const vuln = vulnerabilities.find(v => v.id === av.vulnerability_id);
                    const risk = getRiskLevel(av.risk_score || 0);
                    return (
                      <TableRow key={av.id} hover>
                        <TableCell sx={{ fontWeight: 500 }}>
                          {asset?.name || 'Unknown'}
                        </TableCell>
                        <TableCell>{vuln?.name || 'Unknown'}</TableCell>
                        <TableCell>
                          <Chip label={av.likelihood} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Chip label={av.impact} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>
                          {(av.risk_score || 0).toFixed(1)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={risk.level}
                            color={getRiskLevel(av.risk_score || 0).level === 'Critical' ? 'error' :
                                   getRiskLevel(av.risk_score || 0).level === 'High' ? 'warning' :
                                   getRiskLevel(av.risk_score || 0).level === 'Medium' ? 'info' : 'success'}
                            size="small"
                            sx={{ fontWeight: 600 }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Fade>
    </Box>
  );
};

export default RiskAssessmentEngine;
