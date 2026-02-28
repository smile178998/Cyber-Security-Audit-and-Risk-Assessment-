# AI-Assisted Cybersecurity Risk Assessment & Security Audit Platform

A comprehensive cybersecurity platform built with Node.js backend and React frontend, featuring AI-powered vulnerability analysis, risk assessment, and security audit capabilities.

## Features

### Core Modules
- **User & Auditor Management**: Role-based access control (Admin, Auditor, Auditee)
- **Organization Profile**: Multi-organization support with detailed profiling
- **Asset Inventory**: Comprehensive asset management with CIA classification
- **Threat & Vulnerability Identification**: OWASP Top 10 vulnerability database
- **Risk Assessment Engine**: Automated risk calculation (Likelihood × Impact)
- **Control Audit Checklist**: ISO/IEC 27001 compliance framework
- **Audit Evidence Collection**: File upload and evidence management
- **Compliance Scoring**: Real-time compliance metrics and visualization
- **Audit Findings Generator**: Automated finding generation with severity levels
- **AI Auditor Assistant**: AI-powered consultation for vulnerabilities and controls
- **Report Generator**: Comprehensive audit reports with AI assistance

### Security Features
- JWT-based authentication
- Password hashing with bcrypt
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
- Frontend: http://localhost:3001
- Backend API: http://localhost:3000

## Default Accounts

### Administrator
- Email: admin@cybersec.com
- Password: admin123
- Role: Full system access

### Auditor
- Email: auditor@cybersec.com
- Password: auditor123
- Role: Audit management and reporting

### Auditee
- Email: auditee@cybersec.com
- Password: auditee123
- Role: View assigned audits only

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Users
- `GET /api/users` - Get all users (Admin only)
- `POST /api/users` - Create user (Admin only)
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (Admin only)

### Organizations
- `GET /api/organizations` - Get all organizations
- `POST /api/organizations` - Create organization
- `PUT /api/organizations/:id` - Update organization
- `DELETE /api/organizations/:id` - Delete organization

### Assets
- `GET /api/assets` - Get all assets
- `POST /api/assets` - Create asset
- `PUT /api/assets/:id` - Update asset
- `DELETE /api/assets/:id` - Delete asset

### Audits
- `GET /api/audits` - Get all audits
- `POST /api/audits` - Create audit
- `PUT /api/audits/:id` - Update audit
- `DELETE /api/audits/:id` - Delete audit

### Risk Assessment
- `GET /api/risk-assessment` - Get risk assessment data
- `POST /api/risk-assessment` - Create risk assessment

### AI Assistant
- `POST /api/ai/consult` - Get AI consultation
- `POST /api/ai/generate-report` - Generate AI report

## Database Schema

### Tables
- `users` - User accounts and roles
- `organizations` - Organization profiles
- `assets` - Asset inventory
- `vulnerabilities` - OWASP vulnerability database
- `asset_vulnerabilities` - Asset-vulnerability relationships
- `audit_tasks` - Audit task management
- `audit_checklist` - Audit checklist items
- `audit_evidence` - Evidence collection
- `audit_findings` - Audit findings
- `ai_consultations` - AI consultation history

## Usage Guide

### For Administrators
1. Create and manage user accounts
2. Set up organizations and assign auditors
3. Monitor system compliance and audit progress
4. Generate comprehensive reports

### For Auditors
1. Create and manage audit tasks
2. Conduct security assessments
3. Collect evidence and document findings
4. Generate audit reports with AI assistance

### For Auditees
1. View assigned audits
2. Provide evidence and respond to findings
3. Track compliance status

## Security Considerations

- All passwords are hashed using bcrypt
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

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions, please contact the development team or create an issue in the repository.

---

**Note**: This platform is designed for educational and demonstration purposes. For production use, ensure proper security configurations and regular security updates.
