import React, { useState } from 'react';
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Avatar,
  Menu,
  MenuItem,
  Chip,
  Divider,
  Badge,
  Tooltip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard,
  Assessment,
  Business,
  AccountCircle,
  Notifications,
  TrendingUp,
  Logout,
  People,
  AccountBalance,
  BugReport,
  Speed,
  Checklist,
  Folder,
  Gavel,
  SmartToy,
  Description,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const drawerWidth = 260;

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    {
      text: 'Dashboard',
      icon: <Dashboard />,
      path: '/dashboard'
    },
    {
      text: 'User & Auditor Management',
      icon: <People />,
      path: '/users',
      adminOnly: true
    },
    {
      text: 'Organization Profile',
      icon: <AccountBalance />,
      path: '/organizations',
      adminOnly: true
    },
    {
      text: 'Information Asset Inventory',
      icon: <Business />,
      path: '/assets'
    },
    {
      text: 'Threat & Vulnerability Identification',
      icon: <BugReport />,
      path: '/threat-vulnerability'
    },
    {
      text: 'Risk Assessment Engine',
      icon: <Speed />,
      path: '/risk-engine'
    },
    {
      text: 'Risk Assessment',
      icon: <Assessment />,
      path: '/risk-assessment'
    },
    {
      text: 'Control Audit Checklist',
      icon: <Checklist />,
      path: '/control-checklist'
    },
    {
      text: 'Audit Evidence Collection',
      icon: <Folder />,
      path: '/evidence-collection'
    },
    {
      text: 'Compliance Scoring',
      icon: <TrendingUp />,
      path: '/compliance'
    },
    {
      text: 'Audit Findings Generator',
      icon: <Gavel />,
      path: '/findings-generator'
    },
    {
      text: 'AI Auditor Assistant',
      icon: <SmartToy />,
      path: '/ai-assistant'
    },
    {
      text: 'Report Generator',
      icon: <Description />,
      path: '/reports'
    },
  ];

  // Filter menu items based on user role
  const filteredMenuItems = menuItems.filter(item => {
    if (item.adminOnly && user?.role !== 'admin') {
      return false;
    }
    if (user?.role === 'auditee') {
      // Auditees can see: Dashboard, Asset Inventory, Threat & Vulnerability, Risk Assessment
      return ['Dashboard', 'Information Asset Inventory', 'Threat & Vulnerability Identification', 'Risk Assessment'].includes(item.text);
    }
    if (user?.role === 'auditor') {
      // Auditors can see everything except User & Organization Management
      return !['User & Auditor Management', 'Organization Profile'].includes(item.text);
    }
    return true; // Admin can see all
  });

  const drawer = (
    <Box sx={{ height: '100%', backgroundColor: '#1e293b' }}>
      <Box sx={{ p: 3, backgroundColor: '#6366f1' }}>
        <Typography variant="h6" sx={{ color: 'white', fontWeight: 700 }}>
          CYBERSEC AURA
                </Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
          Assessing Platform
        </Typography>
      </Box>
      <Divider sx={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />
      <List sx={{ px: 2, py: 2 }}>
        {filteredMenuItems.map((item, index) => (
          <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => navigate(item.path)}
              sx={{
                minHeight: 48,
                borderRadius: 2,
                px: 2,
                color: '#cbd5e1',
                '&:hover': {
                  backgroundColor: 'rgba(99, 102, 241, 0.15)',
                  color: 'white',
                },
                '&.Mui-selected': {
                  backgroundColor: '#6366f1',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: '#4f46e5',
                  },
                  '& .MuiListItemIcon-root': {
                    color: 'white',
                  },
                },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText 
                primary={item.text}
                primaryTypographyProps={{ fontWeight: location.pathname === item.path ? 600 : 500 }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          transition: 'width 0.3s ease',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Cyber Security Audit and Risk Assessment
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Chip
              label={user?.role || 'Guest'}
              color="primary"
              size="small"
              sx={{ fontWeight: 'bold' }}
            />
            
            <Tooltip title="Notifications">
              <IconButton color="inherit">
                <Badge badgeContent={0} color="error">
                  <Notifications />
                </Badge>
              </IconButton>
            </Tooltip>

            <Tooltip title="User Menu">
              <IconButton
                color="inherit"
                onClick={handleMenu}
                sx={{ ml: 1 }}
              >
                <Avatar sx={{ width: 24, height: 24, bgcolor: 'secondary.main' }}>
                  <AccountCircle />
                </Avatar>
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: drawerWidth,
              backgroundColor: '#1e293b',
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: drawerWidth,
              backgroundColor: '#1e293b',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: 8,
        }}
      >
        {children}
      </Box>

      {/* User Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        onClick={handleClose}
        PaperProps={{
          elevation: 0,
          sx: {
            overflow: 'visible',
            filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.2))',
            mt: 1.5,
            minWidth: 180,
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem onClick={handleClose}>
          <Avatar sx={{ width: 24, height: 24, mr: 2, bgcolor: 'secondary.main' }}>
            <AccountCircle />
          </Avatar>
          <Box sx={{ ml: 1 }}>
            <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
              {user?.full_name || 'User'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.email || 'user@example.com'}
            </Typography>
          </Box>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <Logout />
          </ListItemIcon>
          <ListItemText primary="Logout" />
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default Layout;
