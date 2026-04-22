import requests
import sys
import json
from datetime import datetime

class VARAPITester:
    def __init__(self, base_url="https://smart-var-audit.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.session = requests.Session()  # Use session for cookie management
        self.admin_token = None
        self.operator_token = None

    def run_test(self, name, method, endpoint, expected_status, data=None, description="", use_auth=False, auth_type="admin"):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        # Use session for cookie-based auth
        session_to_use = self.session

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        if description:
            print(f"   Description: {description}")
        if use_auth:
            print(f"   Auth: {auth_type}")
        
        try:
            if method == 'GET':
                response = session_to_use.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = session_to_use.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = session_to_use.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = session_to_use.delete(url, headers=headers, timeout=30)

            success = response.status_code == expected_status
            
            result = {
                "test_name": name,
                "endpoint": endpoint,
                "method": method,
                "expected_status": expected_status,
                "actual_status": response.status_code,
                "success": success,
                "response_data": None,
                "error": None
            }

            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    result["response_data"] = response.json()
                except:
                    result["response_data"] = response.text
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                    result["error"] = error_data
                except:
                    print(f"   Error: {response.text}")
                    result["error"] = response.text

            self.test_results.append(result)
            return success, result.get("response_data", {})

        except Exception as e:
            print(f"❌ Failed - Exception: {str(e)}")
            result = {
                "test_name": name,
                "endpoint": endpoint,
                "method": method,
                "expected_status": expected_status,
                "actual_status": None,
                "success": False,
                "response_data": None,
                "error": str(e)
            }
            self.test_results.append(result)
            return False, {}

    def login_admin(self):
        """Login as admin user"""
        login_data = {
            "email": "admin@octonvar.com",
            "password": "OctonAdmin2026!"
        }
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data=login_data,
            description="Login as admin user"
        )
        if success:
            print(f"   Admin logged in: {response.get('name')} ({response.get('role')})")
        return success, response

    def login_operator(self):
        """Login as VAR operator"""
        # First register the operator if not exists
        register_data = {
            "name": "Test VAR Operator",
            "email": "operator@test.com",
            "password": "Test1234",
            "role": "var_operator"
        }
        # Try to register (might fail if already exists, that's ok)
        self.run_test(
            "Register VAR Operator",
            "POST",
            "auth/register",
            200,
            data=register_data,
            description="Register VAR operator (may fail if exists)"
        )
        
        # Now login
        login_data = {
            "email": "operator@test.com",
            "password": "Test1234"
        }
        success, response = self.run_test(
            "VAR Operator Login",
            "POST",
            "auth/login",
            200,
            data=login_data,
            description="Login as VAR operator"
        )
        if success:
            print(f"   Operator logged in: {response.get('name')} ({response.get('role')})")
        return success, response

    def logout(self):
        """Logout current user"""
        return self.run_test(
            "Logout",
            "POST",
            "auth/logout",
            200,
            description="Logout current user"
        )

    def test_health_check(self):
        """Test health check endpoint"""
        return self.run_test(
            "Health Check",
            "GET",
            "",
            200,
            description="Basic API health check"
        )

    def test_seed_demo_data(self):
        """Test seeding demo data"""
        return self.run_test(
            "Seed Demo Data",
            "POST",
            "seed-demo",
            200,
            description="Populate database with demo data"
        )

    def test_get_incidents(self):
        """Test getting all incidents"""
        return self.run_test(
            "Get All Incidents",
            "GET",
            "incidents",
            200,
            description="Retrieve list of incidents"
        )

    def test_create_incident(self):
        """Test creating a new incident"""
        incident_data = {
            "incident_type": "foul",
            "description": "Test incident - Late tackle in midfield",
            "timestamp_in_match": "67:30",
            "team_involved": "Test Team",
            "player_involved": "Test Player"
        }
        success, response = self.run_test(
            "Create New Incident",
            "POST",
            "incidents",
            200,
            data=incident_data,
            description="Create incident with AI analysis"
        )
        return success, response

    def test_create_incident_with_video(self):
        """Test creating incident with video_base64 field"""
        # Create a small test video in base64 (minimal MP4 header)
        test_video_b64 = "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE="  # Minimal MP4 header
        
        incident_data = {
            "incident_type": "offside",
            "description": "Test incident with video - Player appears offside during attack",
            "timestamp_in_match": "45:12",
            "team_involved": "Test Team A",
            "player_involved": "Test Player 10",
            "video_base64": test_video_b64
        }
        success, response = self.run_test(
            "Create Incident with Video",
            "POST",
            "incidents",
            200,
            data=incident_data,
            description="Create incident with video_base64 field for streaming"
        )
        return success, response

    def test_get_specific_incident(self, incident_id):
        """Test getting a specific incident"""
        return self.run_test(
            "Get Specific Incident",
            "GET",
            f"incidents/{incident_id}",
            200,
            description=f"Retrieve incident {incident_id}"
        )

    def test_update_incident_decision(self, incident_id):
        """Test updating incident decision"""
        decision_data = {
            "decision_status": "confirmed",
            "final_decision": "Foul confirmed - Yellow card issued",
            "decided_by": "Test_VAR_Operator"
        }
        return self.run_test(
            "Update Incident Decision",
            "PUT",
            f"incidents/{incident_id}/decision",
            200,
            data=decision_data,
            description="Update incident with final decision"
        )

    def test_reanalyze_incident(self, incident_id):
        """Test re-analyzing an incident"""
        return self.run_test(
            "Re-analyze Incident",
            "POST",
            f"incidents/{incident_id}/reanalyze",
            200,
            description="Re-run AI analysis on existing incident"
        )

    def test_ai_text_analysis(self):
        """Test text-only AI analysis"""
        analysis_data = {
            "incident_type": "penalty",
            "description": "Possible handball in penalty area during corner kick",
            "additional_context": "Ball hit defender's arm which was in unnatural position"
        }
        return self.run_test(
            "AI Text Analysis",
            "POST",
            "ai/analyze-text",
            200,
            data=analysis_data,
            description="AI analysis of text description only"
        )

    def test_get_referees(self):
        """Test getting all referees"""
        return self.run_test(
            "Get All Referees",
            "GET",
            "referees",
            200,
            description="Retrieve list of referees"
        )

    def test_create_referee(self):
        """Test creating a new referee"""
        referee_data = {
            "name": "Test Referee",
            "role": "referee",
            "email": "test.referee@var.com"
        }
        success, response = self.run_test(
            "Create New Referee",
            "POST",
            "referees",
            200,
            data=referee_data,
            description="Create new referee profile"
        )
        return success, response

    def test_get_matches(self):
        """Test getting all matches"""
        return self.run_test(
            "Get All Matches",
            "GET",
            "matches",
            200,
            description="Retrieve list of matches"
        )

    def test_create_match(self):
        """Test creating a new match"""
        match_data = {
            "team_home": "Test Home Team",
            "team_away": "Test Away Team",
            "date": "2025-01-20",
            "competition": "Test League",
            "stadium": "Test Stadium"
        }
        success, response = self.run_test(
            "Create New Match",
            "POST",
            "matches",
            200,
            data=match_data,
            description="Create new match record"
        )
        return success, response

    def test_analytics_overview(self):
        """Test analytics overview endpoint"""
        return self.run_test(
            "Analytics Overview",
            "GET",
            "analytics/overview",
            200,
            description="Get system analytics overview"
        )

    def test_analytics_patterns(self):
        """Test historical patterns endpoint"""
        return self.run_test(
            "Historical Patterns",
            "GET",
            "analytics/patterns",
            200,
            description="Get historical decision patterns"
        )

    # ── NEW FEATURES TESTING ──────────────────────────────────

    def test_list_users_admin_only(self):
        """Test listing users (admin only)"""
        return self.run_test(
            "List Users (Admin Only)",
            "GET",
            "users",
            200,
            description="Get list of users - admin only endpoint",
            use_auth=True,
            auth_type="admin"
        )

    def test_list_users_operator_forbidden(self):
        """Test listing users as operator (should fail)"""
        return self.run_test(
            "List Users (Operator - Should Fail)",
            "GET",
            "users",
            403,
            description="Operator should not access users endpoint",
            use_auth=True,
            auth_type="operator"
        )

    def test_assign_match_admin(self, match_id, referee_id, operator_id):
        """Test assigning referee and operator to match (admin only)"""
        assignment_data = {
            "referee_id": referee_id,
            "var_operator_id": operator_id
        }
        return self.run_test(
            "Assign Match (Admin)",
            "PUT",
            f"matches/{match_id}/assign",
            200,
            data=assignment_data,
            description="Assign referee and VAR operator to match",
            use_auth=True,
            auth_type="admin"
        )

    def test_assign_match_operator_forbidden(self, match_id):
        """Test assigning match as operator (should fail)"""
        assignment_data = {
            "referee_id": "test-ref-id",
            "var_operator_id": "test-op-id"
        }
        return self.run_test(
            "Assign Match (Operator - Should Fail)",
            "PUT",
            f"matches/{match_id}/assign",
            403,
            data=assignment_data,
            description="Operator should not assign matches",
            use_auth=True,
            auth_type="operator"
        )

    def test_update_match_status_admin(self, match_id, status):
        """Test updating match status (admin only)"""
        return self.run_test(
            f"Update Match Status to {status} (Admin)",
            "PUT",
            f"matches/{match_id}/status?status={status}",
            200,
            description=f"Change match status to {status}",
            use_auth=True,
            auth_type="admin"
        )

    def test_update_match_status_operator_forbidden(self, match_id):
        """Test updating match status as operator (should fail)"""
        return self.run_test(
            "Update Match Status (Operator - Should Fail)",
            "PUT",
            f"matches/{match_id}/status?status=live",
            403,
            description="Operator should not update match status",
            use_auth=True,
            auth_type="operator"
        )

    def test_submit_feedback(self, incident_id):
        """Test submitting explicit operator feedback"""
        feedback_data = {
            "incident_id": incident_id,
            "was_ai_correct": True,
            "operator_notes": "AI analysis was accurate for this incident"
        }
        return self.run_test(
            "Submit AI Feedback",
            "POST",
            "feedback",
            200,
            data=feedback_data,
            description="Submit explicit operator feedback on AI accuracy",
            use_auth=True,
            auth_type="operator"
        )

    def test_get_feedback_stats(self):
        """Test getting AI feedback statistics"""
        return self.run_test(
            "Get AI Feedback Stats",
            "GET",
            "feedback/stats",
            200,
            description="Get AI accuracy stats with confidence calibration"
        )

    def test_get_feedback_list(self):
        """Test getting feedback entries list"""
        return self.run_test(
            "Get Feedback List",
            "GET",
            "feedback",
            200,
            description="List recent feedback entries"
        )

    def test_incident_decision_creates_feedback(self, incident_id):
        """Test that updating incident decision auto-records AI feedback"""
        decision_data = {
            "decision_status": "confirmed",
            "final_decision": "Foul confirmed - AI was correct",
            "decided_by": "Test_VAR_Operator"
        }
        success, response = self.run_test(
            "Update Decision (Auto-feedback)",
            "PUT",
            f"incidents/{incident_id}/decision",
            200,
            data=decision_data,
            description="Update decision should auto-record AI feedback",
            use_auth=True,
            auth_type="operator"
        )
        
        # Check if feedback was auto-created by checking feedback stats
        if success:
            self.test_get_feedback_stats()
        
        return success, response

    # ── ID PROTECTION MODULE TESTING ──────────────────────────────────

    def test_id_verify(self):
        """Test ID document verification"""
        verification_data = {
            "document_type": "passport",
            "applicant_name": "John Test Smith",
            "date_of_birth": "1990-05-15",
            "id_number": "P123456789",
            "nationality": "United Kingdom",
            "address": "123 Test Street, London, UK",
            "extracted_text": "PASSPORT United Kingdom John Test Smith Date of birth 15 MAY 1990",
            "notes": "Test verification for OCTON ID system"
        }
        success, response = self.run_test(
            "ID Document Verification",
            "POST",
            "id/verify",
            200,
            data=verification_data,
            description="Submit ID document for OCTON AI verification"
        )
        return success, response

    def test_get_id_verifications(self):
        """Test getting all ID verifications"""
        return self.run_test(
            "Get ID Verifications",
            "GET",
            "id/verifications",
            200,
            description="Retrieve list of ID verifications"
        )

    def test_get_id_verifications_with_filters(self):
        """Test getting ID verifications with filters"""
        return self.run_test(
            "Get ID Verifications (Filtered)",
            "GET",
            "id/verifications?status=pending&document_type=passport",
            200,
            description="Retrieve filtered ID verifications"
        )

    def test_get_specific_id_verification(self, verification_id):
        """Test getting a specific ID verification"""
        return self.run_test(
            "Get Specific ID Verification",
            "GET",
            f"id/verifications/{verification_id}",
            200,
            description=f"Retrieve ID verification {verification_id}"
        )

    def test_review_id_verification(self, verification_id, status="approved"):
        """Test reviewing an ID verification"""
        review_data = {
            "review_status": status,
            "reviewer_notes": f"Test review - {status} by automated test",
            "was_ai_correct": True
        }
        return self.run_test(
            f"Review ID Verification ({status})",
            "PUT",
            f"id/verifications/{verification_id}/review",
            200,
            data=review_data,
            description=f"Review ID verification with {status} status",
            use_auth=True,
            auth_type="operator"
        )

    def test_id_analytics(self):
        """Test ID verification analytics"""
        return self.run_test(
            "ID Analytics",
            "GET",
            "id/analytics",
            200,
            description="Get ID verification analytics and fraud statistics"
        )

    def test_id_feedback_stats(self):
        """Test ID feedback statistics"""
        return self.run_test(
            "ID Feedback Stats",
            "GET",
            "id/feedback/stats",
            200,
            description="Get AI feedback statistics for ID module"
        )

    def test_video_file_serving(self, video_path):
        """Test video file serving with Range request support"""
        if not video_path:
            print("⚠️  No video path provided, skipping Range request test")
            return False, {}
            
        # Test normal file request first
        success, response = self.run_test(
            "Video File Serving (Normal)",
            "GET",
            f"files/{video_path}",
            200,
            description="Serve video file without Range header"
        )
        
        if not success:
            return success, response
            
        # Test Range request for video streaming
        url = f"{self.api_url}/files/{video_path}"
        headers = {'Range': 'bytes=0-1023'}  # Request first 1KB
        
        self.tests_run += 1
        print(f"\n🔍 Testing Video Range Request...")
        print(f"   URL: {url}")
        print(f"   Range: bytes=0-1023")
        
        try:
            response = self.session.get(url, headers=headers, timeout=30)
            
            # Should return 206 Partial Content for Range requests
            success = response.status_code == 206
            
            result = {
                "test_name": "Video Range Request",
                "endpoint": f"files/{video_path}",
                "method": "GET",
                "expected_status": 206,
                "actual_status": response.status_code,
                "success": success,
                "response_data": None,
                "error": None
            }
            
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code} (Partial Content)")
                
                # Check for proper Range response headers
                content_range = response.headers.get('Content-Range')
                accept_ranges = response.headers.get('Accept-Ranges')
                content_length = response.headers.get('Content-Length')
                
                print(f"   Content-Range: {content_range}")
                print(f"   Accept-Ranges: {accept_ranges}")
                print(f"   Content-Length: {content_length}")
                
                result["response_data"] = {
                    "content_range": content_range,
                    "accept_ranges": accept_ranges,
                    "content_length": content_length
                }
            else:
                print(f"❌ Failed - Expected 206, got {response.status_code}")
                result["error"] = f"Expected 206 Partial Content, got {response.status_code}"
                
            self.test_results.append(result)
            return success, result.get("response_data", {})
            
        except Exception as e:
            print(f"❌ Failed - Exception: {str(e)}")
            result = {
                "test_name": "Video Range Request",
                "endpoint": f"files/{video_path}",
                "method": "GET",
                "expected_status": 206,
                "actual_status": None,
                "success": False,
                "response_data": None,
                "error": str(e)
            }
            self.test_results.append(result)
            return False, {}

    def test_concurrent_analysis_speed(self):
        """Test analysis speed optimization with concurrent processing"""
        import time
        
        # Create multiple incidents to test concurrent processing
        incidents_data = [
            {
                "incident_type": "offside",
                "description": "Speed test 1 - Offside call during counter-attack with multiple players involved",
                "timestamp_in_match": "23:45",
                "team_involved": "Speed Test Team A",
                "player_involved": "Player A1"
            },
            {
                "incident_type": "penalty", 
                "description": "Speed test 2 - Possible penalty for handball in the box during corner kick situation",
                "timestamp_in_match": "67:12",
                "team_involved": "Speed Test Team B", 
                "player_involved": "Player B2"
            },
            {
                "incident_type": "red_card",
                "description": "Speed test 3 - Dangerous tackle from behind with excessive force endangering opponent safety",
                "timestamp_in_match": "89:30",
                "team_involved": "Speed Test Team C",
                "player_involved": "Player C3"
            }
        ]
        
        print(f"\n🚀 Testing Analysis Speed Optimization...")
        print(f"   Creating {len(incidents_data)} incidents to test concurrent processing")
        
        start_time = time.time()
        successful_analyses = 0
        
        for i, incident_data in enumerate(incidents_data):
            success, response = self.run_test(
                f"Speed Test Incident {i+1}",
                "POST", 
                "incidents",
                200,
                data=incident_data,
                description=f"Speed optimization test {i+1}/3"
            )
            
            if success and response and response.get('ai_analysis'):
                successful_analyses += 1
                analysis = response['ai_analysis']
                processing_time = analysis.get('total_processing_time_ms', 0)
                print(f"   Analysis {i+1} completed in {processing_time}ms")
        
        total_time = time.time() - start_time
        print(f"   Total time for {len(incidents_data)} analyses: {total_time:.2f}s")
        print(f"   Successful analyses: {successful_analyses}/{len(incidents_data)}")
        
        # Test passes if all analyses completed and total time is reasonable
        success = successful_analyses == len(incidents_data) and total_time < 30  # 30s timeout
        
        result = {
            "test_name": "Concurrent Analysis Speed Test",
            "endpoint": "incidents (multiple)",
            "method": "POST",
            "expected_status": 200,
            "actual_status": 200 if success else 500,
            "success": success,
            "response_data": {
                "total_time_seconds": total_time,
                "successful_analyses": successful_analyses,
                "total_analyses": len(incidents_data)
            },
            "error": None if success else "Speed test failed or timed out"
        }
        
        self.test_results.append(result)
        return success, result["response_data"]

def main():
    print("🏟️  VAR Audit System API Testing - NEW FEATURES")
    print("=" * 60)
    
    tester = VARAPITester()
    
    # Test basic endpoints first
    print("\n📋 BASIC ENDPOINTS")
    print("-" * 30)
    
    # Health check
    tester.test_health_check()
    
    # Seed demo data
    tester.test_seed_demo_data()
    
    # Test authentication
    print("\n🔐 AUTHENTICATION TESTING")
    print("-" * 30)
    
    # Login as admin
    admin_success, admin_response = tester.login_admin()
    if not admin_success:
        print("❌ Admin login failed - cannot continue with admin tests")
        return 1
    
    # Test admin-only endpoints
    print("\n👑 ADMIN-ONLY FEATURES")
    print("-" * 30)
    
    # Test users endpoint (admin only)
    tester.test_list_users_admin_only()
    
    # Logout admin and login as operator
    tester.logout()
    operator_success, operator_response = tester.login_operator()
    if not operator_success:
        print("❌ Operator login failed - cannot continue with operator tests")
        return 1
    
    # Test operator restrictions
    print("\n🚫 ROLE RESTRICTION TESTING")
    print("-" * 30)
    
    # Test that operator cannot access admin endpoints
    tester.test_list_users_operator_forbidden()
    
    # Test data retrieval endpoints
    print("\n📊 DATA RETRIEVAL")
    print("-" * 30)
    
    tester.test_get_incidents()
    tester.test_get_referees()
    tester.test_get_matches()
    tester.test_analytics_overview()
    tester.test_analytics_patterns()
    
    # Test creation endpoints
    print("\n🆕 DATA CREATION")
    print("-" * 30)
    
    # Create incident and get its ID for further testing
    success, incident_response = tester.test_create_incident()
    incident_id = None
    if success and incident_response:
        incident_id = incident_response.get('id')
        print(f"   Created incident ID: {incident_id}")
    
    # Test video upload functionality
    print("\n🎥 VIDEO UPLOAD & STREAMING")
    print("-" * 30)
    
    # Create incident with video
    success, video_incident_response = tester.test_create_incident_with_video()
    video_incident_id = None
    video_path = None
    if success and video_incident_response:
        video_incident_id = video_incident_response.get('id')
        video_path = video_incident_response.get('video_storage_path')
        print(f"   Created video incident ID: {video_incident_id}")
        print(f"   Video storage path: {video_path}")
        
        # Test video file serving with Range requests
        if video_path:
            tester.test_video_file_serving(video_path)
    
    # Test analysis speed optimization
    print("\n⚡ ANALYSIS SPEED OPTIMIZATION")
    print("-" * 30)
    
    tester.test_concurrent_analysis_speed()
    
    # Create referee
    success, referee_response = tester.test_create_referee()
    referee_id = None
    if success and referee_response:
        referee_id = referee_response.get('id')
        print(f"   Created referee ID: {referee_id}")
    
    # Create match
    success, match_response = tester.test_create_match()
    match_id = None
    if success and match_response:
        match_id = match_response.get('id')
        print(f"   Created match ID: {match_id}")
    
    # Test ID Protection Module
    print("\n🆔 ID PROTECTION MODULE")
    print("-" * 30)
    
    # Test ID verification creation
    success, verification_response = tester.test_id_verify()
    verification_id = None
    if success and verification_response:
        verification_id = verification_response.get('id')
        print(f"   Created verification ID: {verification_id}")
    
    # Test ID data retrieval
    tester.test_get_id_verifications()
    tester.test_get_id_verifications_with_filters()
    tester.test_id_analytics()
    tester.test_id_feedback_stats()
    
    # Test specific verification operations if we have a verification ID
    if verification_id:
        tester.test_get_specific_id_verification(verification_id)
        tester.test_review_id_verification(verification_id, "approved")
    
    # Test AI feedback loop
    print("\n🧠 AI FEEDBACK LOOP TESTING")
    print("-" * 30)
    
    # Test feedback endpoints
    tester.test_get_feedback_stats()
    tester.test_get_feedback_list()
    
    if incident_id:
        # Test explicit feedback submission
        tester.test_submit_feedback(incident_id)
        
        # Test that decision update auto-creates feedback
        tester.test_incident_decision_creates_feedback(incident_id)
    
    # Test match assignment workflow (need admin)
    print("\n🏆 MATCH ASSIGNMENT WORKFLOW")
    print("-" * 30)
    
    # Login as admin for match assignment tests
    tester.logout()
    admin_success, _ = tester.login_admin()
    
    if match_id and referee_id and admin_success:
        # Test match assignment (admin only)
        tester.test_assign_match_admin(match_id, referee_id, referee_id)  # Use referee as operator for test
        
        # Test match status update (admin only)
        tester.test_update_match_status_admin(match_id, "live")
        tester.test_update_match_status_admin(match_id, "completed")
        
        # Test operator restrictions on match management
        tester.logout()
        tester.login_operator()
        tester.test_assign_match_operator_forbidden(match_id)
        tester.test_update_match_status_operator_forbidden(match_id)
    
    # Test AI analysis
    print("\n🤖 AI ANALYSIS")
    print("-" * 30)
    
    tester.test_ai_text_analysis()
    
    # Test incident-specific operations if we have an incident ID
    if incident_id:
        print("\n🔄 INCIDENT OPERATIONS")
        print("-" * 30)
        
        tester.test_get_specific_incident(incident_id)
        tester.test_reanalyze_incident(incident_id)
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"📊 FINAL RESULTS")
    print(f"Tests Run: {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run*100):.1f}%")
    
    # Print failed tests
    failed_tests = [t for t in tester.test_results if not t['success']]
    if failed_tests:
        print(f"\n❌ FAILED TESTS ({len(failed_tests)}):")
        for test in failed_tests:
            print(f"   • {test['test_name']}: {test.get('error', 'Status code mismatch')}")
    
    # Print passed tests summary
    passed_tests = [t for t in tester.test_results if t['success']]
    if passed_tests:
        print(f"\n✅ PASSED TESTS ({len(passed_tests)}):")
        for test in passed_tests:
            print(f"   • {test['test_name']}")
    
    # Return appropriate exit code
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())