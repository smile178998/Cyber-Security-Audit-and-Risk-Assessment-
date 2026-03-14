# CYBERSEC AURA: CYBER SECURITY AUDIT AND RISK ASSESSMENT 

This is a comprehensive cybersecurity platform built with Node.js backend and React frontend, featuring AI-powered vulnerability analysis, risk assessment, and security audit capabilities.

## Features

### Core Modules
- **Dashbord**: Role-based dashboard for cybersecurity audits, risk tracking, and compliance tasks.
- **User & Auditor Management**: Role-based access control (Admin, Auditor, Auditee)
- **Organization Profile**: Multi-organization support with detailed profiling
- **Information Asset Inventory**: Comprehensive asset management with CIA classification
- **Threat & Vulnerability Identification**: OWASP Top 10 vulnerability database
- **Risk Assessment Engine**: Automated risk calculation (Likelihood × Impact)
- **Risk Assessment**: Risk Assessment identifies threats, scores risk (Likelihood x Impact), and prioritizes mitigation actions.
- **Control Audit Checklist**: OCTAVE Allegro compliance framework
- **Audit Evidence Collection**: File upload and evidence management
- **Compliance Scoring**: Real-time compliance metrics and visualization
- **Audit Findings Generator**: Automated finding generation with severity levels
- **AI Auditor Assistant**: AI-powered consultation for vulnerabilities and controls
- **Report Generator**: Comprehensive audit reports with AI assistance

### Security Features
- JWT-based authentication
- Password hashing with bcryptjs
- Role-based access control
- Input validation and sanitization
- Rate limiting
- Security headers

### Technology Stack
- **Backend**: Node.js, Express, MySQL
- **Frontend**: React, Material-UI, React Router
- **Database**: MySQL with comprehensive schema
- **AI Integration**: OpenAI API for intelligent analysis
- **Charts**: Recharts for data visualization

## Installation

### Prerequisites
- Node.js (v14 or higher)
- MySQL (v5.7 or higher)
- npm or yarn

### Setup Instructions

1. **Clone and Install Dependencies**
```bash
cd ai-cybersecurity-platform
npm install
cd client
npm install
```

2. **Database Setup**
- Create a MySQL database named `cybersecurity_audit`
- Update database configuration in `.env` file (see Environment Variables section)

3. **Environment Variables**
Create a `.env` file in the root directory:
```env
# Database Configuration
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=cybersecurity_audit

# JWT Configuration
JWT_SECRET=your-secret-key-here

# Server Configuration
PORT=3000

# OpenAI Configuration (Optional)
OPENAI_API_KEY=your-openai-api-key
```

4. **Start the Application**
```bash
# Start backend server
npm start

# In a new terminal, start frontend
cd client
npm start
```

5. **Access the Application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:3000

## Default Accounts

### Administrator
- Email: admin@cybersec.com
- Password: admin123
- Role: admin

### Auditor
- Email: auditor@cybersec.com
- Password: auditor123
- Role: auditor

### Auditee
- Email: auditee@cybersec.com
- Password: auditee123
- Role: auditee

## Usage Guide

### For Admin
1. Create and manage user accounts
2. Set up organizations and assign auditors
3. Monitor system compliance and audit progress
4. Generate comprehensive reports
5. Collect evidence and document findings
6. Generate audit reports with AI assistance

### For Auditor
1. Create and manage audit tasks
2. Conduct security assessments
3. Collect evidence and document findings
4. Generate audit reports with AI assistance

### For Auditee
1. View assigned audits
2. Provide evidence and respond to findings
3. Track compliance status

## Security Considerations

- All passwords are hashed using bcryptjs
- JWT tokens are used for authentication
- Input validation is implemented on all endpoints
- Rate limiting prevents abuse
- Security headers are configured

## Development

### Project Structure
```
ai-cybersecurity-platform/
├── server.js              # Main server file
├── package.json            # Backend dependencies
├── client/                 # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── contexts/      # React contexts
│   │   ├── pages/         # Page components
│   │   └── App.js         # Main app component
│   └── package.json       # Frontend dependencies
└── README.md              # This file
```

### Available Scripts
- `npm start` - Start backend server
- `npm run dev` - Start with nodemon
- `npm run client` - Start frontend
- `npm run install-all` - Install all dependencies

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Note**: This platform is designed for educational and demonstration purposes. For production use, ensure proper security configurations and regular security updates.
