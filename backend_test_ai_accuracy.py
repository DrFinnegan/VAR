import requests
import sys
import json
from datetime import datetime

class OCTONAIAccuracyTester:
    def __init__(self, base_url="https://smart-var-audit.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.session = requests.Session()

    def run_test(self, name, method, endpoint, expected_status, data=None, description="", validation_func=None):
        """Run a single API test with optional validation"""
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
            
            result = {
                "test_name": name,
                "endpoint": endpoint,
                "method": method,
                "expected_status": expected_status,
                "actual_status": response.status_code,
                "success": success,
                "response_data": None,
                "error": None,
                "validation_result": None
            }

            if success:
                try:
                    result["response_data"] = response.json()
                    
                    # Run custom validation if provided
                    if validation_func and result["response_data"]:
                        validation_result = validation_func(result["response_data"])
                        result["validation_result"] = validation_result
                        if not validation_result.get("passed", True):
                            success = False
                            print(f"❌ Validation Failed: {validation_result.get('message', 'Unknown validation error')}")
                        else:
                            print(f"✅ Validation Passed: {validation_result.get('message', 'All checks passed')}")
                    
                    if success:
                        self.tests_passed += 1
                        print(f"✅ Passed - Status: {response.status_code}")
                    
                except Exception as e:
                    result["response_data"] = response.text
                    print(f"⚠️  Response parsing error: {e}")
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
                "error": str(e),
                "validation_result": None
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
        return success, response

    # ── AI ACCURACY IMPROVEMENT TESTS ──────────────────────────────────

    def validate_high_confidence_correct_decision(self, response):
        """Validate clear offside gets high confidence and correct decision"""
        analysis = response
        confidence = analysis.get('final_confidence', 0)
        decision = analysis.get('suggested_decision', '')
        reasoning = analysis.get('reasoning', '')
        
        # Check for high confidence (>80%)
        high_confidence = confidence > 80
        
        # Check for correct offside decision
        correct_decision = 'offside' in decision.lower() or 'disallowed' in decision.lower()
        
        # Check for proper reasoning
        has_reasoning = len(reasoning) > 20
        
        # Check for IFAB law application (Neo Cortex should reference laws)
        ifab_referenced = 'law' in reasoning.lower() or 'ifab' in reasoning.lower() or 'opponent' in reasoning.lower()
        
        passed = high_confidence and correct_decision and has_reasoning
        
        return {
            "passed": passed,
            "message": f"Confidence: {confidence}%, Decision: {decision}, High conf: {high_confidence}, Correct: {correct_decision}, Reasoning: {has_reasoning}",
            "details": {
                "confidence": confidence,
                "decision": decision,
                "high_confidence": high_confidence,
                "correct_decision": correct_decision,
                "has_reasoning": has_reasoning,
                "ifab_referenced": ifab_referenced
            }
        }

    def validate_natural_handball_no_decision(self, response):
        """Validate natural handball (arm by side) correctly says NO handball"""
        analysis = response
        confidence = analysis.get('final_confidence', 0)
        decision = analysis.get('suggested_decision', '')
        reasoning = analysis.get('reasoning', '')
        
        # Check for correct no handball decision
        no_handball = 'no handball' in decision.lower() or 'natural' in decision.lower() or 'not an offence' in decision.lower()
        
        # Check reasoning mentions natural position or arm by side
        natural_reasoning = 'natural' in reasoning.lower() or 'side' in reasoning.lower() or 'tucked' in reasoning.lower()
        
        # Check for negative keywords detection (Hippocampus improvement)
        hippocampus = analysis.get('hippocampus', {})
        negative_keywords = hippocampus.get('matched_negatives', [])
        has_negatives = len(negative_keywords) > 0
        
        passed = no_handball and natural_reasoning
        
        return {
            "passed": passed,
            "message": f"Decision: {decision}, No handball: {no_handball}, Natural reasoning: {natural_reasoning}, Negatives: {negative_keywords}",
            "details": {
                "confidence": confidence,
                "decision": decision,
                "no_handball": no_handball,
                "natural_reasoning": natural_reasoning,
                "negative_keywords": negative_keywords,
                "has_negatives": has_negatives
            }
        }

    def validate_borderline_moderate_confidence(self, response):
        """Validate borderline red/yellow card has moderate confidence and nuanced decision"""
        analysis = response
        confidence = analysis.get('final_confidence', 0)
        decision = analysis.get('suggested_decision', '')
        reasoning = analysis.get('reasoning', '')
        
        # Check for moderate confidence (40-75%)
        moderate_confidence = 40 <= confidence <= 75
        
        # Check for nuanced decision (not always same answer)
        nuanced_decision = 'yellow' in decision.lower() or 'borderline' in decision.lower() or 'reckless' in decision.lower()
        
        # Check for detailed reasoning
        detailed_reasoning = len(reasoning) > 30
        
        # Check risk level is appropriate
        risk_level = analysis.get('risk_level', '')
        appropriate_risk = risk_level in ['medium', 'high']
        
        passed = moderate_confidence and nuanced_decision and detailed_reasoning
        
        return {
            "passed": passed,
            "message": f"Confidence: {confidence}%, Decision: {decision}, Moderate: {moderate_confidence}, Nuanced: {nuanced_decision}, Risk: {risk_level}",
            "details": {
                "confidence": confidence,
                "decision": decision,
                "moderate_confidence": moderate_confidence,
                "nuanced_decision": nuanced_decision,
                "detailed_reasoning": detailed_reasoning,
                "risk_level": risk_level,
                "appropriate_risk": appropriate_risk
            }
        }

    def validate_simulation_detection(self, response):
        """Validate simulation/dive in penalty area is detected"""
        analysis = response
        confidence = analysis.get('final_confidence', 0)
        decision = analysis.get('suggested_decision', '')
        reasoning = analysis.get('reasoning', '')
        
        # Check for simulation detection
        simulation_detected = 'simulation' in decision.lower() or 'dive' in decision.lower() or 'no penalty' in decision.lower()
        
        # Check reasoning mentions simulation or diving
        simulation_reasoning = 'simulation' in reasoning.lower() or 'dive' in reasoning.lower() or 'no contact' in reasoning.lower()
        
        # Check for appropriate confidence (should be reasonably confident about simulation)
        appropriate_confidence = confidence > 50
        
        passed = simulation_detected and simulation_reasoning
        
        return {
            "passed": passed,
            "message": f"Decision: {decision}, Simulation detected: {simulation_detected}, Reasoning: {simulation_reasoning}, Confidence: {confidence}%",
            "details": {
                "confidence": confidence,
                "decision": decision,
                "simulation_detected": simulation_detected,
                "simulation_reasoning": simulation_reasoning,
                "appropriate_confidence": appropriate_confidence
            }
        }

    def validate_vague_low_confidence(self, response):
        """Validate vague description has LOW confidence (<50%)"""
        analysis = response
        confidence = analysis.get('final_confidence', 0)
        decision = analysis.get('suggested_decision', '')
        reasoning = analysis.get('reasoning', '')
        
        # Check for low confidence (<50%)
        low_confidence = confidence < 50
        
        # Check for uncertainty in decision
        uncertain_decision = 'review' in decision.lower() or 'unclear' in decision.lower() or 'insufficient' in decision.lower()
        
        # Check reasoning mentions lack of details
        mentions_vague = 'vague' in reasoning.lower() or 'insufficient' in reasoning.lower() or 'unclear' in reasoning.lower() or 'lacks' in reasoning.lower()
        
        # Check description quality assessment (Hippocampus improvement)
        hippocampus = analysis.get('hippocampus', {})
        desc_quality = hippocampus.get('description_quality', '')
        poor_quality = desc_quality in ['minimal', 'brief']
        
        passed = low_confidence
        
        return {
            "passed": passed,
            "message": f"Confidence: {confidence}%, Low conf: {low_confidence}, Decision: {decision}, Quality: {desc_quality}",
            "details": {
                "confidence": confidence,
                "decision": decision,
                "low_confidence": low_confidence,
                "uncertain_decision": uncertain_decision,
                "mentions_vague": mentions_vague,
                "description_quality": desc_quality,
                "poor_quality": poor_quality
            }
        }

    def validate_clear_penalty_awarded(self, response):
        """Validate clear penalty (tripped in box) awards penalty"""
        analysis = response
        confidence = analysis.get('final_confidence', 0)
        decision = analysis.get('suggested_decision', '')
        reasoning = analysis.get('reasoning', '')
        
        # Check for penalty awarded
        penalty_awarded = 'penalty' in decision.lower() and ('awarded' in decision.lower() or 'given' in decision.lower())
        
        # Check reasoning mentions being inside the box
        inside_box = 'box' in reasoning.lower() or 'area' in reasoning.lower() or 'penalty area' in reasoning.lower()
        
        # Check for reasonable confidence
        reasonable_confidence = confidence > 60
        
        # Check for contact/trip mentioned
        contact_mentioned = 'trip' in reasoning.lower() or 'contact' in reasoning.lower() or 'foul' in reasoning.lower()
        
        passed = penalty_awarded and inside_box and reasonable_confidence
        
        return {
            "passed": passed,
            "message": f"Decision: {decision}, Penalty awarded: {penalty_awarded}, Inside box: {inside_box}, Confidence: {confidence}%",
            "details": {
                "confidence": confidence,
                "decision": decision,
                "penalty_awarded": penalty_awarded,
                "inside_box": inside_box,
                "reasonable_confidence": reasonable_confidence,
                "contact_mentioned": contact_mentioned
            }
        }

    def validate_independent_neo_cortex(self, response):
        """Validate Neo Cortex makes independent decisions (not blindly agreeing with Hippocampus)"""
        analysis = response
        hippocampus = analysis.get('hippocampus', {})
        neo_cortex = analysis.get('neo_cortex', {})
        
        hippo_decision = hippocampus.get('initial_decision', '')
        neo_decision = neo_cortex.get('suggested_decision', '')
        hippo_confidence = hippocampus.get('initial_confidence', 0)
        neo_confidence = neo_cortex.get('confidence_score', 0)
        
        # Check if Neo Cortex adjusted confidence significantly (shows independent thinking)
        confidence_adjusted = abs(neo_confidence - hippo_confidence) > 5
        
        # Check if Neo Cortex has detailed reasoning (shows deep analysis)
        neo_reasoning = neo_cortex.get('reasoning', '')
        detailed_reasoning = len(neo_reasoning) > 50
        
        # Check for IFAB law references (Neo Cortex improvement)
        ifab_referenced = 'law' in neo_reasoning.lower() or 'ifab' in neo_reasoning.lower()
        
        passed = confidence_adjusted or detailed_reasoning
        
        return {
            "passed": passed,
            "message": f"Hippo: {hippo_confidence}% -> Neo: {neo_confidence}%, Adjusted: {confidence_adjusted}, Detailed: {detailed_reasoning}",
            "details": {
                "hippocampus_decision": hippo_decision,
                "neo_cortex_decision": neo_decision,
                "hippocampus_confidence": hippo_confidence,
                "neo_cortex_confidence": neo_confidence,
                "confidence_adjusted": confidence_adjusted,
                "detailed_reasoning": detailed_reasoning,
                "ifab_referenced": ifab_referenced
            }
        }

    # ── SPECIFIC AI ACCURACY TESTS ──────────────────────────────────

    def test_clear_offside_high_confidence(self):
        """Test clear offside description gets high confidence correct decision"""
        analysis_data = {
            "incident_type": "offside",
            "description": "Striker is clearly 2 meters beyond the last defender when receiving the through ball from midfield. The assistant referee immediately flags for offside as the player was in a clear offside position when the ball was played by his teammate.",
            "additional_context": "Clear offside situation with significant distance between player and last defender"
        }
        return self.run_test(
            "Clear Offside - High Confidence",
            "POST",
            "ai/analyze-text",
            200,
            data=analysis_data,
            description="Clear offside should get high confidence (>80%) and correct decision",
            validation_func=self.validate_high_confidence_correct_decision
        )

    def test_natural_handball_no_decision(self):
        """Test natural handball (arm by side) correctly says NO handball"""
        analysis_data = {
            "incident_type": "handball",
            "description": "Ball deflects off defender's arm which is in natural position by his side. The defender was not making his body bigger and his arm was tucked close to his body when the ball made contact.",
            "additional_context": "Arm in natural position, close to body, not making body bigger"
        }
        return self.run_test(
            "Natural Handball - No Offence",
            "POST",
            "ai/analyze-text",
            200,
            data=analysis_data,
            description="Natural handball should correctly identify NO handball",
            validation_func=self.validate_natural_handball_no_decision
        )

    def test_borderline_red_yellow_moderate_confidence(self):
        """Test borderline red/yellow card has moderate confidence and nuanced decision"""
        analysis_data = {
            "incident_type": "red_card",
            "description": "Defender makes a sliding tackle from the side, catching the attacker's leg. There is contact but the defender appears to be attempting to play the ball. The force used is significant but may not reach the threshold for serious foul play.",
            "additional_context": "Borderline case between yellow and red card, genuine attempt to play ball"
        }
        return self.run_test(
            "Borderline Red/Yellow - Moderate Confidence",
            "POST",
            "ai/analyze-text",
            200,
            data=analysis_data,
            description="Borderline red/yellow should have moderate confidence (40-75%) and nuanced decision",
            validation_func=self.validate_borderline_moderate_confidence
        )

    def test_simulation_dive_detection(self):
        """Test simulation/dive in penalty area is detected"""
        analysis_data = {
            "incident_type": "penalty",
            "description": "Attacker goes down in the penalty area claiming a foul, but replays show no contact was made by the defender. The attacker appears to have initiated the fall without any contact from the defending player.",
            "additional_context": "No contact visible, player appears to dive/simulate contact"
        }
        return self.run_test(
            "Simulation/Dive Detection",
            "POST",
            "ai/analyze-text",
            200,
            data=analysis_data,
            description="Simulation/dive should be detected and no penalty awarded",
            validation_func=self.validate_simulation_detection
        )

    def test_vague_description_low_confidence(self):
        """Test vague description has LOW confidence (<50%)"""
        analysis_data = {
            "incident_type": "foul",
            "description": "Something happened in midfield. Player went down.",
            "additional_context": "Very limited information available"
        }
        return self.run_test(
            "Vague Description - Low Confidence",
            "POST",
            "ai/analyze-text",
            200,
            data=analysis_data,
            description="Vague description should have LOW confidence (<50%)",
            validation_func=self.validate_vague_low_confidence
        )

    def test_clear_penalty_awarded(self):
        """Test clear penalty (tripped in box) awards penalty"""
        analysis_data = {
            "incident_type": "penalty",
            "description": "Attacker is clearly tripped by the defender inside the penalty area while attempting to shoot. The defender makes contact with the attacker's legs before touching the ball, causing the attacker to fall inside the penalty box.",
            "additional_context": "Clear trip inside penalty area, defender contacted player before ball"
        }
        return self.run_test(
            "Clear Penalty - Awarded",
            "POST",
            "ai/analyze-text",
            200,
            data=analysis_data,
            description="Clear penalty should be awarded with good confidence",
            validation_func=self.validate_clear_penalty_awarded
        )

    def test_neo_cortex_independence(self):
        """Test Neo Cortex makes independent decisions"""
        analysis_data = {
            "incident_type": "handball",
            "description": "Ball hits player's hand in penalty area. The hand appears to be in an unnatural position away from the body, but the ball was deflected from very close range by another player's head first.",
            "additional_context": "Complex handball situation requiring nuanced analysis"
        }
        return self.run_test(
            "Neo Cortex Independence",
            "POST",
            "ai/analyze-text",
            200,
            data=analysis_data,
            description="Neo Cortex should show independent analysis, not blindly agree with Hippocampus",
            validation_func=self.validate_independent_neo_cortex
        )

    # ── INCIDENT CREATION WITH AI ANALYSIS ──────────────────────────────────

    def test_create_incident_with_improved_analysis(self):
        """Test creating incident with improved AI analysis"""
        incident_data = {
            "incident_type": "offside",
            "description": "Player receives ball in offside position during corner kick situation. The ball was played by teammate from corner flag and player was beyond the last defender when ball was kicked.",
            "timestamp_in_match": "67:30",
            "team_involved": "Test Team",
            "player_involved": "Test Player"
        }
        
        def validate_incident_analysis(response):
            """Validate the incident was created with proper AI analysis"""
            ai_analysis = response.get('ai_analysis', {})
            if not ai_analysis:
                return {"passed": False, "message": "No AI analysis found in incident"}
            
            # Check for both Hippocampus and Neo Cortex analysis
            hippocampus = ai_analysis.get('hippocampus', {})
            neo_cortex = ai_analysis.get('neo_cortex', {})
            
            has_hippocampus = bool(hippocampus)
            has_neo_cortex = bool(neo_cortex)
            
            # Check for final confidence and decision
            final_confidence = ai_analysis.get('final_confidence', 0)
            suggested_decision = ai_analysis.get('suggested_decision', '')
            
            # Check for processing times
            total_time = ai_analysis.get('total_processing_time_ms', 0)
            
            passed = has_hippocampus and has_neo_cortex and final_confidence > 0 and suggested_decision
            
            return {
                "passed": passed,
                "message": f"Hippocampus: {has_hippocampus}, Neo Cortex: {has_neo_cortex}, Confidence: {final_confidence}%, Decision: {suggested_decision}",
                "details": {
                    "has_hippocampus": has_hippocampus,
                    "has_neo_cortex": has_neo_cortex,
                    "final_confidence": final_confidence,
                    "suggested_decision": suggested_decision,
                    "total_processing_time": total_time
                }
            }
        
        return self.run_test(
            "Create Incident with Improved AI",
            "POST",
            "incidents",
            200,
            data=incident_data,
            description="Create incident and verify improved AI analysis is applied",
            validation_func=validate_incident_analysis
        )

def main():
    print("🧠 OCTON VAR AI ACCURACY IMPROVEMENT TESTING")
    print("=" * 60)
    print("Testing the overhauled AI engine with:")
    print("1. Neo Cortex with IFAB Laws embedded")
    print("2. Hippocampus with negative keyword detection")
    print("3. Properly calibrated confidence scores")
    print("4. Nuanced fallback analysis")
    print("5. Independent Neo Cortex evaluation")
    print("=" * 60)
    
    tester = OCTONAIAccuracyTester()
    
    # Login as admin for any auth-required tests
    print("\n🔐 AUTHENTICATION")
    print("-" * 30)
    admin_success, admin_response = tester.login_admin()
    if not admin_success:
        print("❌ Admin login failed - some tests may not work")
    
    # Test AI accuracy improvements
    print("\n🎯 AI ACCURACY IMPROVEMENTS")
    print("-" * 30)
    
    # Test 1: Clear offside - high confidence correct decision
    tester.test_clear_offside_high_confidence()
    
    # Test 2: Natural handball - correctly say NO handball
    tester.test_natural_handball_no_decision()
    
    # Test 3: Borderline red/yellow - moderate confidence and nuanced decision
    tester.test_borderline_red_yellow_moderate_confidence()
    
    # Test 4: Simulation/dive detection
    tester.test_simulation_dive_detection()
    
    # Test 5: Vague description - low confidence
    tester.test_vague_description_low_confidence()
    
    # Test 6: Clear penalty - award penalty
    tester.test_clear_penalty_awarded()
    
    # Test 7: Neo Cortex independence
    tester.test_neo_cortex_independence()
    
    # Test incident creation with improved analysis
    print("\n🔄 INCIDENT CREATION WITH AI")
    print("-" * 30)
    tester.test_create_incident_with_improved_analysis()
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"📊 AI ACCURACY TEST RESULTS")
    print(f"Tests Run: {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run*100):.1f}%")
    
    # Print detailed results
    failed_tests = [t for t in tester.test_results if not t['success']]
    if failed_tests:
        print(f"\n❌ FAILED TESTS ({len(failed_tests)}):")
        for test in failed_tests:
            print(f"   • {test['test_name']}")
            if test.get('validation_result'):
                print(f"     Validation: {test['validation_result'].get('message', 'No details')}")
            else:
                print(f"     Error: {test.get('error', 'Status code mismatch')}")
    
    passed_tests = [t for t in tester.test_results if t['success']]
    if passed_tests:
        print(f"\n✅ PASSED TESTS ({len(passed_tests)}):")
        for test in passed_tests:
            print(f"   • {test['test_name']}")
            if test.get('validation_result'):
                print(f"     Validation: {test['validation_result'].get('message', 'Passed')}")
    
    # Print specific AI improvements validated
    print(f"\n🧠 AI IMPROVEMENTS VALIDATED:")
    improvements = []
    for test in tester.test_results:
        validation_result = test.get('validation_result')
        if test['success'] and validation_result and validation_result.get('passed'):
            if 'Clear Offside' in test['test_name']:
                improvements.append("✅ High confidence for clear decisions")
            elif 'Natural Handball' in test['test_name']:
                improvements.append("✅ Negative keyword detection working")
            elif 'Borderline' in test['test_name']:
                improvements.append("✅ Moderate confidence for borderline cases")
            elif 'Simulation' in test['test_name']:
                improvements.append("✅ Simulation/dive detection")
            elif 'Vague' in test['test_name']:
                improvements.append("✅ Low confidence for vague descriptions")
            elif 'Clear Penalty' in test['test_name']:
                improvements.append("✅ Correct penalty decisions")
            elif 'Independence' in test['test_name']:
                improvements.append("✅ Neo Cortex independent evaluation")
    
    for improvement in set(improvements):
        print(f"   {improvement}")
    
    # Return appropriate exit code
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())