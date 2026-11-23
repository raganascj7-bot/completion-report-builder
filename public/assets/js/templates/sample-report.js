/**
 * Text-only sample content for previewing a design when no report exists
 * yet. Mirrors the TOLE August 2026 report.
 */
export function sampleReport() {
    return {
        meta: { clientName: 'Sample Client', month: 8, year: 2026 },
        images: {},
        data: {
            cover: { clientDisplay: 'Sample Client\n@CEBU', preparedByName: 'Jeah Tradio', preparedByCompany: 'JT Digital Marketing Services', image: null },
            summary: {
                reportDate: '2026-08-30', contractorName: 'JT Digital Marketing Services',
                contractorAddress: 'Joel Casipong Apt 3, Brgy. Looc\nLapu-Lapu City, Cebu, Philippines 6015',
                projectNames: 'Sample Client Social Media Marketing Services\nSample Client Graphics Designer',
                projectDescription: 'Monthly social media management and layouts, including content creation, strategy planning, graphics layout, community moderation, and content & event shoot.',
                startDate: '2026-08-01', completionDate: '2026-08-30',
                closingNote: 'Thank you and we assure you our best services again.',
                preparerName: 'Jeah Tradio', preparerCompany: 'JT Digital Marketing Services',
                approverName: 'Client Representative', approverPosition: 'Marketing Manager', approverDepartment: 'Marketing Department',
            },
            calendar: { columns: '1', images: [] },
            content: { columns: '1', images: [] },
            posted: [{ id: 'p1', title: 'CONTENT POSTED: FB & IG', columns: '1', images: [] }],
            creatives: [{ id: 'g1', title: 'Field of Rides', subtitle: '(KV and Print Collaterals)', links: [{ label: 'Google Drive Link', url: 'https://drive.google.com/' }], columns: 'auto', images: [] }],
            shoots: [
                { date: '2026-08-01', description: 'Cafe – Capture ambient shots of the café, including the storefront, interior and seating areas.', link: 'https://drive.google.com/drive/folders/example-1' },
                { date: '2026-08-08', description: 'Outdoor – Capture wide shots of open spaces, greenery and walkways.', link: 'https://drive.google.com/drive/folders/example-2' },
            ],
            breakdown: [
                { status: 'IN PROGRESS', title: 'Photographer/Videographer', bullets: ['3x on-site coverage for content shoot'], note: 'Two more shoots are scheduled this month.' },
                { status: 'COMPLETE', title: 'Creative Requests/Graphics Designer', bullets: [], note: 'All creative requests were delivered on time.' },
                { status: 'TO BE FOLLOWED', title: 'Analytics & Performance Reporting:', bullets: ['Facebook, Instagram, TikTok'], note: 'Reporting follows after month-end.' },
            ],
            contact: {
                viberName: 'Jeah Tradio', viberNumber: '+63 945 561 6280', email: 'hello@jtdigitalmarketingservices.com',
                website: 'jtdigitalmarketingservices.com', location: 'Lapu-Lapu City, Cebu\nPhilippines 6015', image: null,
            },
        },
    };
}
