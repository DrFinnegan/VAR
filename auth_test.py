import requests
import sys

class AuthTester:
    def __init__(self, base_url="https://smart-var-audit.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0

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
                response = self.session.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=headers, timeout=30)

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, response.text
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Exception: {str(e)}")
            return False, {}

    def test_register(self):
        """Test user registration"""
        register_data = {
            "name": "Test Operator",
            "email": "operator@test.com",
            "password": "Test1234",
            "role": "var_operator"
        }
        return self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            data=register_data,
            description="Register new VAR operator"
        )

    def test_admin_login(self):
        """Test admin login with provided credentials"""
        login_data = {
            "email": "admin@octonvar.com",
            "password": "OctonAdmin2026!"
        }
        return self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data=login_data,
            description="Login with admin credentials"
        )

    def test_operator_login(self):
        """Test operator login"""
        login_data = {
            "email": "operator@test.com",
            "password": "Test1234"
        }
        return self.run_test(
            "Operator Login",
            "POST",
            "auth/login",
            200,
            data=login_data,
            description="Login with operator credentials"
        )

    def test_get_current_user(self):
        """Test getting current user info"""
        return self.run_test(
            "Get Current User",
            "GET",
            "auth/me",
            200,
            description="Get current authenticated user"
        )

    def test_logout(self):
        """Test logout"""
        return self.run_test(
            "Logout",
            "POST",
            "auth/logout",
            200,
            description="Logout and clear cookies"
        )

def main():
    print("🔐 OCTON VAR Authentication Testing")
    print("=" * 50)
    
    tester = AuthTester()
    
    # Test registration
    print("\n👤 USER REGISTRATION")
    print("-" * 30)
    tester.test_register()
    
    # Test admin login
    print("\n🔑 ADMIN LOGIN")
    print("-" * 30)
    success, response = tester.test_admin_login()
    if success:
        print(f"   Admin user: {response.get('name', 'Unknown')}")
        print(f"   Role: {response.get('role', 'Unknown')}")
    
    # Test current user endpoint
    print("\n👤 CURRENT USER")
    print("-" * 30)
    tester.test_get_current_user()
    
    # Test logout
    print("\n🚪 LOGOUT")
    print("-" * 30)
    tester.test_logout()
    
    # Test operator login
    print("\n🔑 OPERATOR LOGIN")
    print("-" * 30)
    success, response = tester.test_operator_login()
    if success:
        print(f"   Operator user: {response.get('name', 'Unknown')}")
        print(f"   Role: {response.get('role', 'Unknown')}")
    
    # Test current user after operator login
    print("\n👤 CURRENT USER (OPERATOR)")
    print("-" * 30)
    tester.test_get_current_user()
    
    # Final logout
    print("\n🚪 FINAL LOGOUT")
    print("-" * 30)
    tester.test_logout()
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 AUTH TEST RESULTS")
    print(f"Tests Run: {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run*100):.1f}%")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())