import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Grid,
  CircularProgress,
  Alert,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Tooltip,
} from '@mui/material';
import {
  SmartToy,
  Send,
  History,
  VerticalAlignTop,
  VerticalAlignBottom,
  KeyboardArrowUp,
  KeyboardArrowDown
} from '@mui/icons-material';
import api from '../utils/api';

const AIAssistant = () => {
  const [query, setQuery] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastMode, setLastMode] = useState('Auto');
  const [pagination, setPagination] = useState({ limit: 20, offset: 0, total: 0 });
  const chatContainerRef = useRef(null);

  const formatTimestamp = (value) => {
    if (!value) return new Date().toLocaleString();
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return new Date().toLocaleString();
    return dt.toLocaleString();
  };

  const mapConsultationsToMessages = useCallback((rows) => {
    const messages = [];
    rows.slice().reverse().forEach((row) => {
      messages.push({
        id: `${row.id}-q`,
        type: 'user',
        content: row.query || '',
        timestamp: formatTimestamp(row.created_at)
      });
      messages.push({
        id: `${row.id}-a`,
        type: 'assistant',
        content: row.response || '',
        timestamp: formatTimestamp(row.created_at)
      });
    });
    return messages;
  }, []);

  const loadHistory = useCallback(async ({ offset = 0, mode = 'replace' } = {}) => {
    try {
      setHistoryLoading(true);
      setError('');
      const beforeHeight = chatContainerRef.current?.scrollHeight || 0;
      const response = await api.get('/ai/consultations', {
        params: {
          limit: pagination.limit,
          offset
        },
        cache: false
      });
      const rows = Array.isArray(response.data?.data) ? response.data.data : [];
      const messages = mapConsultationsToMessages(rows);

      setPagination((prev) => ({
        ...prev,
        offset,
        total: Number(response.data?.total || 0)
      }));
      setChatHistory((prev) => {
        if (mode === 'prepend') return [...messages, ...prev];
        if (mode === 'append') return [...prev, ...messages];
        return messages;
      });

      setTimeout(() => {
        const box = chatContainerRef.current;
        if (!box) return;
        if (mode === 'prepend') {
          const afterHeight = box.scrollHeight;
          box.scrollTop += afterHeight - beforeHeight;
        } else {
          box.scrollTop = box.scrollHeight;
        }
      }, 0);
    } catch (loadError) {
      console.error('Error loading AI consultation history:', loadError);
      setError(loadError.response?.data?.error || 'Failed to load AI consultation history.');
    } finally {
      setHistoryLoading(false);
    }
  }, [mapConsultationsToMessages, pagination.limit]);

  useEffect(() => {
    loadHistory({ offset: 0, mode: 'replace' });
  }, [loadHistory]);

  const canLoadOlder = useMemo(() => {
    return pagination.offset + pagination.limit < pagination.total;
  }, [pagination.limit, pagination.offset, pagination.total]);

  const scrollToTop = () => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = 0;
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  };

  const loadOlderHistory = () => {
    if (!canLoadOlder || historyLoading) return;
    const nextOffset = pagination.offset + pagination.limit;
    loadHistory({ offset: nextOffset, mode: 'prepend' });
  };

  const handleChatWheel = (event) => {
    const box = chatContainerRef.current;
    if (!box) return;
    const { deltaY } = event;
    const canScrollUp = box.scrollTop > 0;
    const canScrollDown = box.scrollTop + box.clientHeight < box.scrollHeight;
    const willScrollUp = deltaY < 0;
    const willScrollDown = deltaY > 0;

    if ((willScrollUp && canScrollUp) || (willScrollDown && canScrollDown)) {
      event.preventDefault();
      event.stopPropagation();
      box.scrollTop += deltaY;
    }
  };

  const handleSubmit = async () => {
    if (!query.trim()) {
      setError('Please enter a question or topic');
      return;
    }

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: query.trim(),
      timestamp: new Date().toLocaleString()
    };

    setChatHistory((prev) => [...prev, userMessage]);
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/ai/consult', {
        query: query.trim()
      });
      setLastMode(response.data?.mode || 'Auto');

      const assistantMessage = {
        id: Date.now() + 1,
        type: 'assistant',
        content: response.data?.response || 'No response available from AI assistant.',
        timestamp: new Date().toLocaleString()
      };

      setChatHistory((prev) => [...prev, assistantMessage]);
      setQuery('');
      setTimeout(scrollToBottom, 0);
    } catch (submitError) {
      console.error('Error getting AI response:', submitError);
      setError(submitError.response?.data?.error || 'Failed to get AI response. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => {
    setChatHistory([]);
    setError('');
  };

  const clearSavedHistory = async () => {
    try {
      await api.delete('/ai/consultations/me');
      setPagination((prev) => ({ ...prev, offset: 0, total: 0 }));
      clearHistory();
    } catch (deleteError) {
      setError(deleteError.response?.data?.error || 'Failed to clear saved history.');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" sx={{ mb: 3 }}>
        AI Auditor Assistant
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card sx={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2, minHeight: 0 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Security Consultation
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 1 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Tooltip title="Load older history">
                    <span>
                      <Button size="small" variant="outlined" onClick={loadOlderHistory} disabled={!canLoadOlder || historyLoading}>
                        {historyLoading ? 'Loading...' : 'Load Older'}
                      </Button>
                    </span>
                  </Tooltip>
                  <Tooltip title="Top">
                    <Button size="small" variant="outlined" onClick={scrollToTop}><VerticalAlignTop fontSize="small" /></Button>
                  </Tooltip>
                  <Tooltip title="Bottom">
                    <Button size="small" variant="outlined" onClick={scrollToBottom}><VerticalAlignBottom fontSize="small" /></Button>
                  </Tooltip>
                </Box>
              </Box>

              <Box
                ref={chatContainerRef}
                onWheel={handleChatWheel}
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  mb: 2,
                  border: 1,
                  borderColor: 'grey.300',
                  borderRadius: 1,
                  p: 2,
                  scrollBehavior: 'smooth',
                  overscrollBehavior: 'contain'
                }}
              >
                {chatHistory.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <SmartToy sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
                    <Typography variant="body2" color="text.secondary">
                      Ask your security question. The assistant will automatically apply Module 10 options (Audit Advisor, Report Writer, Control Recommendation, Vulnerability Explainer).
                    </Typography>
                  </Box>
                ) : (
                  chatHistory.map((message) => (
                    <Box key={message.id} sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        {message.type === 'user' ? (
                          <Typography variant="caption" color="primary">
                            You ({message.timestamp})
                          </Typography>
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <SmartToy sx={{ fontSize: 16 }} />
                            <Typography variant="caption" color="secondary">
                              AI Assistant ({message.timestamp})
                            </Typography>
                          </Box>
                        )}
                      </Box>
                      <Paper
                        sx={{
                          p: 2,
                          backgroundColor: message.type === 'user' ? 'primary.50' : 'grey.50',
                          ml: message.type === 'user' ? 4 : 0,
                          mr: message.type === 'assistant' ? 4 : 0
                        }}
                      >
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                          {message.content}
                        </Typography>
                      </Paper>
                    </Box>
                  ))
                )}

                {(loading || historyLoading) && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="text.secondary">
                      {loading ? 'AI Assistant is processing...' : 'Loading consultation history...'}
                    </Typography>
                  </Box>
                )}
              </Box>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  fullWidth
                  multiline
                  maxRows={3}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask your security question here..."
                  disabled={loading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
                <Button
                  variant="contained"
                  endIcon={<Send />}
                  onClick={handleSubmit}
                  disabled={loading || !query.trim()}
                  sx={{ minWidth: 'auto' }}
                >
                  Send
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Card>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    Quick Actions
                  </Typography>
                  <List dense>
                    <ListItem disablePadding>
                      <ListItemButton onClick={scrollToTop}>
                        <ListItemIcon>
                          <KeyboardArrowUp />
                        </ListItemIcon>
                        <ListItemText primary="Scroll To Top" />
                      </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding>
                      <ListItemButton onClick={scrollToBottom}>
                        <ListItemIcon>
                          <KeyboardArrowDown />
                        </ListItemIcon>
                        <ListItemText primary="Scroll To Bottom" />
                      </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding>
                      <ListItemButton onClick={clearHistory}>
                        <ListItemIcon>
                          <History />
                        </ListItemIcon>
                        <ListItemText primary="Clear Chat Window" />
                      </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => loadHistory({ offset: 0, mode: 'replace' })}>
                        <ListItemIcon>
                          <History />
                        </ListItemIcon>
                        <ListItemText primary="Reload Saved History" />
                      </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding>
                      <ListItemButton onClick={clearSavedHistory}>
                        <ListItemIcon>
                          <History />
                        </ListItemIcon>
                        <ListItemText primary="Clear Saved History" />
                      </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding>
                      <ListItemButton onClick={loadOlderHistory} disabled={!canLoadOlder || historyLoading}>
                        <ListItemIcon>
                          <History />
                        </ListItemIcon>
                        <ListItemText primary={canLoadOlder ? 'Load Older History' : 'No Older History'} />
                      </ListItemButton>
                    </ListItem>
                    <ListItem disablePadding>
                      <ListItemButton onClick={() => loadHistory({ offset: 0, mode: 'replace' })} disabled={historyLoading}>
                        <ListItemIcon>
                          <History />
                        </ListItemIcon>
                        <ListItemText primary="Back To Latest" />
                      </ListItemButton>
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    Session Info
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Messages: {chatHistory.length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      AI Mode: {lastMode}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Status: {loading ? 'Processing...' : 'Ready'}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>
      </Grid>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
};

export default AIAssistant;


