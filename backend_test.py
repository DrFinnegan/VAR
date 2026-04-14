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

    def run_test(self, name, method, endpoint, expected_status, data=None, description=""):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        if description:
            print(f"   Description: {description}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)

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

def main():
    print("🏟️  VAR Audit System API Testing")
    print("=" * 50)
    
    tester = VARAPITester()
    
    # Test basic endpoints first
    print("\n📋 BASIC ENDPOINTS")
    print("-" * 30)
    
    # Health check
    tester.test_health_check()
    
    # Seed demo data
    tester.test_seed_demo_data()
    
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
    
    # Test AI analysis
    print("\n🤖 AI ANALYSIS")
    print("-" * 30)
    
    tester.test_ai_text_analysis()
    
    # Test incident-specific operations if we have an incident ID
    if incident_id:
        print("\n🔄 INCIDENT OPERATIONS")
        print("-" * 30)
        
        tester.test_get_specific_incident(incident_id)
        tester.test_update_incident_decision(incident_id)
        tester.test_reanalyze_incident(incident_id)
    
    # Print final results
    print("\n" + "=" * 50)
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
    
    # Return appropriate exit code
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())