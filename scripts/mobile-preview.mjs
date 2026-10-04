// Local presentation fixtures only. Never connect this server to production data.
// Run npm run build, then node scripts/mobile-preview.mjs. Open /__preview/public,
// /__preview/patient, /__preview/dentist or /__preview/clinic-admin on port 4301.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist/mydentalplatform/browser');
const types = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png'};

const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const clinic = { id: 'mobile-clinic', clinicId: 'mobile-clinic', name: 'Preview Dental Clinic',
  doctorName: 'Dr Preview', doctorQualification: 'BDS', doctorBio: [], active: true,
  subscriptionPlan: 'pro', subscriptionStatus: 'active', theme: 'blue', marketplaceSlug: 'preview-clinic',
  marketplaceStatus: 'verified', marketplaceVerifiedDoctorIds: ['preview-doctor'], city: 'Noida',
  addressLine1: 'Preview Road', phone: '9999999999', whatsappNumber: '9999999999',
  hours: [], services: [{name: 'Consultation', description: 'Dental consultation'}], plans: [], testimonials: [], social: {},
  bookingRefPrefix: 'DEMO', marketplaceProfile: {region: 'delhi-ncr', locality: 'Sector 75', consultationFee: 500,
    acceptingNewPatients: true, experienceYears: 8, serviceIds: ['root-canal', 'cleaning-scaling'], languages: ['English', 'Hindi']} };
const doctor = {id:'preview-doctor', name:'Dr Preview', fullName:'Dr Preview', qualification:'BDS', available:true,
  speciality:'General Dentistry', specialization:'General Dentistry', schedule:{}, consultationFee:500};
const appointment = {id:'preview-visit', clinicId:clinic.id, clinicName:clinic.name, clinicPhone:clinic.phone,
  clinicAddress:clinic.addressLine1, marketplaceSlug:clinic.marketplaceSlug, bookingRef:'DEMO-MOBILE',
  patientName:'Preview Patient', name:'Preview Patient', phone:'9999999999', date, time:'10:00', service:'Consultation',
  doctorName:doctor.name, doctorId:doctor.id, status:'confirmed', consultationMode:'in_person', review:null};
const roles = {public:'/dentists', patient:'/appointments', dentist:'/professional/workspace', 'clinic-admin':'/business/clinic/dashboard'};
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4301');
  const p = url.pathname;
  const json = (data, status = 200) => {res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if (p.startsWith('/__preview/')) {
    const role = p.split('/').pop();
    if (!Object.hasOwn(roles, role)) return json({},404);
    const availability = url.searchParams.get('availability') === 'empty' ? 'empty' : 'normal';
    res.writeHead(302, {'Set-Cookie':[`mobile-preview=${role}; Path=/; HttpOnly; SameSite=Strict`, `preview-availability=${availability}; Path=/; HttpOnly; SameSite=Strict`], Location:roles[role]}); return res.end();
  }
  if (p.startsWith('/api/')) {
    const role = /mobile-preview=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? 'public';
    if (p === '/api/auth/refresh') return role === 'public' ? json({},401) : json({accessToken:'local-preview-only',expiresIn:3600,user:{id:'preview-user',email:'preview@example.test',role,clinicId:role==='clinic-admin'?clinic.id:null}});
    if (p === '/api/auth/logout') {res.setHeader('Set-Cookie','mobile-preview=public; Path=/; HttpOnly; SameSite=Strict');return json({});}
    if (p === '/api/v1/providers') return json({providers:[],totalCount:0});
    if (p === '/api/marketplace/clinics') return json({dentists:[clinic],totalCount:1});
    if (p === '/api/marketplace/clinics/preview-clinic' || p === '/api/clinics/current') return json(clinic);
    if (p.endsWith('/availability')) return json({dentistSlug:clinic.marketplaceSlug,timezone:'Asia/Kolkata',days:req.headers.cookie?.includes('preview-availability=empty') ? [] : [{date,slots:['10:00','10:30','11:00'].map(time=>({doctorId:doctor.id,doctorName:doctor.name,time,startsAt:`${date}T${time}:00+05:30`}))}]});
    if (p.endsWith('/dentists')) return json([]);
    if (p.endsWith('/doctors')) return json([doctor]);
    if (p.endsWith('/reviews')) return json([]);
    if (p === '/api/public/video-consultations/status') return json({available:false});
    if (p === '/api/public/booking-verification') return json({required:false,available:false});
    if (p.endsWith('/hold-slot')) return json({holdToken:'local-preview-hold',expiresAt:new Date(Date.now()+600000).toISOString()});
    if (p === '/api/public/appointments' && req.method === 'POST') return json({bookingRef:'DEMO-MOBILE'});
    if (p === '/api/patient/account/session') return json({profile:{accountLabel:'Preview patient'},appointments:[appointment]});
    if (p === '/api/providers/me') return json({fullName:doctor.name,verificationStatus:'verified',languages:['English'],locations:[{id:'preview-location',name:clinic.name,city:'Noida',status:'active',schedule:{}}]});
    if (p === '/api/providers/me/appointments') return json([{...appointment,booking_ref:appointment.bookingRef,patient_name:appointment.patientName,phone_e164:'+919999999999',location_name:clinic.name,source:'marketplace'}]);
    if (p === '/api/admin/appointments' || p === '/api/clinics/current/appointments') return json([appointment]);
    if (p === '/api/admin/enquiries' || p === '/api/clinics/current/contacts') return json([]);
    return json({},404);
  }
  try {
    let file = path.resolve(root, '.' + decodeURIComponent(p));
    if (!file.startsWith(root + path.sep)) file = path.join(root,'index.html');
    try {if (!(await fs.stat(file)).isFile()) file = path.join(root,'index.html');}
    catch {file = path.join(root,'index.html');}
    res.writeHead(200, {'Content-Type':types[path.extname(file)] ?? 'application/octet-stream','Cache-Control':'no-store'});
    res.end(await fs.readFile(file));
  } catch {res.writeHead(404);res.end('Run npm run build first.');}
}).listen(4301,'127.0.0.1',()=>console.log('Local mobile fixtures: http://127.0.0.1:4301/__preview/public'));
